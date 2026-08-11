# RAGSuite — Architecture

> **Standalone backend repo:** For current org + SSO architecture, see [backend/organization-and-sso.md](./backend/organization-and-sso.md).  
> This file describes the **full-stack monorepo** view (frontend + backend). Backend-only details: [backend/architecture.md](./backend/architecture.md).

## Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                        │
│  frontend/client/src/                                           │
│                                                                 │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Admin SPA│  │Chat Widget│  │Search Wdgt │  │  Contexts  │  │
│  │ (main)   │  │(UMD bundle│  │(UMD bundle)│  │ Auth/RAG   │  │
│  └──────────┘  └───────────┘  └────────────┘  └────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ /api/v1/* (Axios)
┌───────────────────────────▼─────────────────────────────────────┐
│  Backend (FastAPI + Python 3.14)                                │
│  backend/app/                                                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Routes (26 modules)                                     │  │
│  │  rag · crawl · documents · analytics · gmail · clickup   │  │
│  │  api_keys · user · chatbot · embeddings · sessions · ... │  │
│  └───────────────────────┬──────────────────────────────────┘  │
│                          │                                      │
│  ┌───────────────────────▼──────────────────────────────────┐  │
│  │  Services (28 modules)                                   │  │
│  │  rag/ · crawler · job_queue · scheduler                  │  │
│  │  gmail_service · clickup_service · audit_service         │  │
│  │  ingest_runtime · crawl_orchestration · ...              │  │
│  └──────────┬─────────────────────────┬──────────┬──────────┘  │
│             │                         │          │              │
│  ┌──────────▼──┐  ┌───────────────────▼──┐  ┌───▼──────────┐  │
│  │ PostgreSQL  │  │ ChromaDB             │  │    Redis     │  │
│  │ SQLAlchemy  │  │ Vector store         │  │ Session store│  │
│  │ Alembic     │  │ (embedded or HTTP)   │  │ (job queue)  │  │
│  └─────────────┘  └──────────────────────┘  └──────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  APScheduler — background jobs                           │  │
│  │  (scheduled crawls, Gmail sync, cleanup)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Models (PostgreSQL)

Core entities and relationships:

```
User ──< Project ──< CrawlSource ──< CrawlJob
                  │
                  ├──< Document
                  ├──< ChatSession ──< ChatMessage
                  ├──< ApiKey
                  └──< SearchConfig / ChatConfig

User ──< AuditLog
User ──< EmailVerification
User ──< TwoFactorAuth
```

ChromaDB collections are keyed by `project_id`; metadata stored in PostgreSQL.

## RAG Pipeline

```
Query
  │
  ▼
EmbedQuery (sentence-transformers / OpenAI / Mistral)
  │
  ▼
ChromaDB.query(n_results=k, where={project_id})
  │
  ▼
Chunk reranking + similarity threshold filter
(DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT)
  │
  ▼
Prompt construction (system prompt + context chunks + history)
  │
  ▼
LLM API (OpenAI / Mistral / Ollama / Anthropic / Gemini)
  │
  ▼
Streaming response + source citations
```

## Ingest Pipeline

```
CrawlJob.start()
  │
  ├── Scrapy + Playwright (JS-rendered pages)
  │     └── BeautifulSoup text extraction
  │
  └── Document upload (PDF / DOCX / TXT)
        └── LlamaIndex text extraction

Text chunks
  │
  ▼
Embedder (factory selects model from project config)
  │
  ▼
ChromaDB.add() + PostgreSQL metadata
  │
  ▼
CrawlJob.status = COMPLETED / Document.status = INDEXED
```

## Authentication Flow

```
POST /api/v1/auth/login
  │
  ├── Verify password (bcrypt)
  ├── Check email_verified flag
  ├── Check 2FA (if enabled) → TOTP verify
  └── Issue JWT (access + refresh tokens)

Protected routes:
  Request → Bearer token → JWT decode → get_current_user dependency
```

**Planned:** SSO via OIDC/SAML (`/api/v1/auth/sso/*`) issuing the same JWT + `UserSession`. See [planned/sso.md](./planned/sso.md).

**Planned:** Login-only UX — disable public `POST /auth/register`; users provisioned by org admin. See [planned/organization-architecture.md](./planned/organization-architecture.md).

## Multi-tenancy

All data is scoped by `project_id` in PostgreSQL. ChromaDB collections use `project_id` as collection name. Users can own multiple projects; API keys are project-scoped.

**Organization layer (partial today, expanding):** `User.org_id` links users to an `Organization` with quota caps (`max_users`, `max_projects`, etc.). **Planned:** org admins, member ACL per project, no self-registration — [planned/organization-architecture.md](./planned/organization-architecture.md).

## Background Jobs (APScheduler)

| Job | Schedule | Description |
|-----|----------|-------------|
| Scheduled crawls | Per-source cron | Re-crawl configured sources |
| Gmail sync | Configurable | Sync new inbox messages |
| Cleanup | Daily | Remove stale sessions/temp files |

## LLM Provider Matrix

| Provider | Chat | Embeddings | Notes |
|---------|------|-----------|-------|
| OpenAI | ✓ | ✓ | GPT-4o, text-embedding-3 |
| Mistral | ✓ | ✓ | mistral-embed |
| Ollama | ✓ | ✓ | Local self-hosted |
| Anthropic | ✓ | — | Claude 3.x |
| Gemini | ✓ | — | gemini-pro |

Chat and embedding models are configured independently per project.

---

## Connectors (content integrations)

External knowledge sources plug into the shared connector framework:

```
connector_integrations  →  CONNECTOR_SYNC job  →  DOCUMENT_INGEST per file  →  ChromaDB
```

| Connector | Status | API prefix |
|-----------|--------|------------|
| Google Drive | Implemented | `/api/v1/connectors/google_drive` |
| Notion | Implemented | `/api/v1/connectors/notion` |
| Confluence | Implemented | `/api/v1/connectors/confluence` |
| SharePoint | Implemented | `/api/v1/connectors/sharepoint` |
| Slack | Implemented | `/api/v1/connectors/slack` |
| Gmail, ClickUp | Implemented (legacy, separate tables) | `/api/v1/gmail`, `/api/v1/clickup` |

Framework: `app/services/connectors/framework.py`  
Details: [connectors/README.md](./connectors/README.md)

---

## Organization & access control (current vs planned)

### Today

```
User (is_admin flag) ──< Project ──< data (crawl, documents, chat, …)
User.org_id ──> Organization (quota caps: max_users, max_projects, …)
```

- JWT + `UserSession` for auth; optional 2FA
- Public registration and login (`POST /auth/register`, `/signup` UI)
- `is_admin` is a global boolean, not org-scoped role matrix
- Project access: owner-based; all projects visible to owning user

### Target (planned)

```
Organization
  ├── Org Admin(s)     — create users, assign permissions (no self-registration)
  ├── Members          — selective access per project (admin-assigned)
  └── Projects         — org-owned workspaces
```

- **Login only** — no public signup; first admin via bootstrap CLI
- `organization_members` + `project_members` for ACL
- SSO (OIDC/SAML) for enterprise login

Full design: [planned/organization-architecture.md](./planned/organization-architecture.md) · [planned/sso.md](./planned/sso.md) · [planned/README.md](./planned/README.md)

**Backend implementation specs:** [backend/future/organization.md](./backend/future/organization.md) · [backend/future/sso.md](./backend/future/sso.md)

---

## SSO (planned)

Enterprise single sign-on will sit alongside password login:

```
Login page → /auth/sso/start → IdP (OIDC/SAML) → callback → JWT + UserSession
```

- Per-organization IdP configuration
- Optional JIT member provisioning (never default org_admin)
- Reuses session model from password auth

Details: [planned/sso.md](./planned/sso.md)


## Local client ports (2026-07)

- API: `:9090`
- Target admin UI (frontend (Server workspace) Expo web): `:9091`
- `FRONTEND_BASE_URL=http://localhost:9091`
- Keep backend and UI in separate git/Cursor workspaces.
