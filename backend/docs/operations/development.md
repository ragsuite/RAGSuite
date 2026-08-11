# RAGSuite — Development Guide

## Local Development Setup

Run the automated setup script:
```bash
bash scripts/setup.sh
```

Or follow the manual steps below.

## Backend

### Setup

```bash
cd backend
python3.14 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # configure DATABASE_URL, JWT_SECRET_KEY
alembic upgrade head
```

### Run dev server

```bash
source .venv/bin/activate
python run.py
# API: http://localhost:9090
# Swagger: http://localhost:9090/docs
# ReDoc: http://localhost:9090/redoc
```

### Run tests

```bash
source .venv/bin/activate
python -m pytest tests/ -v

# Specific test file
python -m pytest tests/test_rag_cache_policy.py -v

# With coverage
python -m pytest tests/ --cov=app --cov-report=html
```

### Database migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Create a new migration (autogenerate from models.py changes)
alembic revision --autogenerate -m "add my_table"

# Rollback one step
alembic downgrade -1

# Check current version
alembic current

# View migration history
alembic history
```

### Project structure conventions

```
backend/app/
├── routes/         HTTP layer — request parsing, auth guards, response shape
│                   Keep thin: validate input, call service, return response.
│
├── services/       Business logic — DB queries, external APIs, heavy computation
│                   No HTTP types (Request/Response) here.
│
├── models.py       SQLAlchemy ORM models — one class per DB table
├── schemas.py      Pydantic schemas — request bodies and response models
├── settings.py     All config via Pydantic BaseSettings (reads backend/.env)
└── auth.py         JWT helpers, get_current_user dependency
```

Adding a new feature:
1. Add ORM model to `models.py`
2. Create migration: `alembic revision --autogenerate -m "add feature_name"`
3. Add Pydantic schemas to `schemas.py`
4. Create `services/feature_name_service.py` with business logic
5. Create `routes/feature_name.py` with HTTP endpoints
6. Register router in `main.py`

## Frontend

### Setup

```bash
cd frontend
npm ci
```

### Run dev server

```bash
npm run dev
# App: http://localhost:5173
# API proxied to http://localhost:9090 via Vite proxy config
```

### Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run build:widget` | Chat widget UMD → `dist/widget/` |
| `npm run build:search-widget` | Search widget UMD → `dist/search-widget/` |
| `npm run build:all` | All three builds |
| `npm run check` | TypeScript type check |
| `npm run test:prepare-streaming-md` | Test streaming markdown parser |

### Project structure conventions

```
frontend/client/src/
├── components/     Reusable UI components, organized by domain
│   ├── admin/      Admin panel components
│   ├── auth/       Auth forms (login, register, 2FA)
│   ├── common/     Generic reusables (modals, buttons, loaders)
│   ├── layout/     Header, sidebar, nav
│   └── ui/         shadcn/ui primitives (do not edit directly)
│
├── pages/          Route-level components (one per page/view)
├── hooks/          Custom React hooks (data fetching, state, etc.)
├── services/api/   Axios API client — one file per backend route group
├── contexts/       React Context providers
├── types/          TypeScript type definitions
├── constants/      Route map, API endpoints, validation rules
└── utils/          Pure utility functions
```

Adding a new page:
1. Create `pages/MyPage/index.tsx`
2. Add hook `hooks/useMyFeature.ts` (TanStack Query for server state)
3. Add API calls to `services/api/myFeature.ts`
4. Add route constant to `constants/routes.ts`
5. Wire up in `App.tsx` routing

### Path alias

`@/` resolves to `client/src/`. Example:
```ts
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
```

### Adding shadcn/ui components

```bash
npx shadcn@latest add <component-name>
# components land in client/src/components/ui/
```

## Code Style

### Backend (Python)

- Follow PEP 8
- Type annotations on all function signatures
- Pydantic models for all input validation (no raw `dict` from request body)
- Async functions for all route handlers (`async def`)
- Use `Depends(get_current_user)` for auth on protected routes

### Frontend (TypeScript)

- Strict TypeScript — no `any` types
- Named exports (not default exports) for components
- `useQuery`/`useMutation` from TanStack Query for all server state
- `zod` schemas for form validation
- Tailwind classes only — no inline styles

## Testing

### Backend tests (pytest)

Test files live in `backend/tests/`. Current coverage:
- `test_rag_cache_policy.py` — RAG cache behavior
- `test_job_queue_claim.py` — Job queue claiming logic
- `test_crawl_orchestration.py` — Crawl job orchestration
- `test_document_ingest_orchestration.py` — Document ingest flow
- `test_ingest_runtime.py` — Thread pool ingest runtime
- `test_relevance_normalization.py` — Score normalization

### Frontend tests

- `npm run test:prepare-streaming-md` — streaming markdown parser unit test

## Common Dev Tasks

### Reset local database

```bash
# Drop and recreate
dropdb rag_suite && createdb rag_suite
cd backend && alembic upgrade head
```

### Reset ChromaDB

```bash
# Remove local Chroma data (adjust path per CHROMA_PERSIST_PATH in .env)
rm -rf ../chroma_db
```

### Inspect API with curl

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:9090/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r .access_token)

# List projects
curl -H "Authorization: Bearer $TOKEN" http://localhost:9090/api/v1/projects
```

---

## Related documentation

| Topic | Document |
|-------|----------|
| **Doc index** | [docs/README.md](../README.md) |
| **AI memory** | [docs/ai/AI_PROJECT_MEMORY.md](../ai/AI_PROJECT_MEMORY.md) |
| **Backend (full)** | [backend/README.md](./backend/README.md) |
| **External client contract** | [backend/external-client-contract.md](./backend/external-client-contract.md) |
| Architecture | [architecture.md](./architecture.md) |
| Connectors | [connectors/README.md](../connectors/README.md) |
| Future backend | [backend/future/](../backend/future/README.md) |
