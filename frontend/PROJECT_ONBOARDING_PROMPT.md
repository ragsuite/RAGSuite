# Universal AI Project Context Recovery Prompt

> **Workspace:** `/Users/arun/RAGSuite_Server` (`frontend/` + `backend/`).  
> **Do not edit** `/Users/arun/RAGSuite_backend` or `/Users/arun/mobile-ragsuite`.  
> **API:** `http://localhost:9090` · **Web (compose):** `http://localhost:9091`

You are joining an existing software project. Your job is to **reconstruct project context** and write two artifacts before making any code changes:

- `AI_PROJECT_CONTEXT_REPORT.md` — detailed, evidence-cited analysis
- `AI_PROJECT_MEMORY.md` — compact, durable memory for future AI sessions

Your first task is **context reconstruction, not implementation**.

---

## Non-Negotiable Rules

- **Do not modify source code** until both artifacts are complete and the user explicitly approves moving to implementation.
- **Prefer evidence over inference.** If you infer, label it as **Assumption** and explain why.
- **Cite evidence** for important claims (file path, and line references when available).
- **Clearly distinguish facts from assumptions** in all outputs.
- **Do not ask many questions up front.** Only ask when blocked; batch to 1–2 critical questions at a time.
- **Complete the full analysis** before proposing code changes.

---

## Phase 0: Establish Ground Truth

Identify and document:

- Repository root
- Package/dependency manager(s)
- Primary language(s) and runtime(s)
- How the application is started locally
- How tests are run (if discoverable)

**Output:** A short "What this repo appears to be" summary (3–6 bullets), each backed by evidence.

---

## Phase 1: Discover Context Sources

Search for and prioritize the following files (highest to lowest):

1. `CLAUDE.md`, `AGENTS.md`, `CURSOR.md`, `PROJECT_CONTEXT.md`, `PROJECT_ONBOARDING_PROMPT.md`
2. `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`
3. `docs/**`
4. `.cursor/rules/**`, `.github/**` (workflows, templates, CODEOWNERS)
5. Onboarding, roadmap, planning, RFC, ADR, or specification documents
6. Environment and deployment notes: `.env.example`, `docker-compose*`, `ddev*`, `k8s*`, `terraform*`, `ansible*`

Treat discovered documentation as the project's source of truth.

**Output:** A ranked list of context sources with a 1–2 line summary of each.

---

## Phase 2: Analyze Project Structure

Determine:

- Project purpose and business domain
- Target users
- Technology stack (frameworks, database, cache, queue, auth, observability)
- Application architecture (monolith, services, frontend/backend split)
- Deployment architecture (environments, CI/CD, hosting)
- Major modules and their responsibilities
- External dependencies and integrations
- Coding standards and patterns (if documented)

**Output:** A high-level architecture summary and a simple diagram (text or mermaid).

---

## Phase 3: Recover Historical Context

Analyze:

- Git history (recent commits, especially last 20–50)
- Branch naming patterns
- Tags, releases, and changelog files
- Pull request or issue references in commit messages
- Recent changes to CI/CD configuration

Identify:

- Features recently added
- Bugs recently fixed
- Refactoring efforts
- Architectural changes
- Recurring problem areas

**Output:** A timeline of recent project evolution (bulleted), with evidence citations.

---

## Phase 4: Identify Current Work

Search for:

- `TODO`, `FIXME`, `HACK`, `XXX`, `BUG`, `TEMP`, `WIP`
- Feature flags, toggles, and config switches
- Disabled or commented-out code
- Experimental, draft, or spike modules
- Failing, skipped, or flaky tests
- Draft or incomplete documentation

Determine:

- Work in progress
- Incomplete features
- Technical debt
- Areas under active development

**Output:** A prioritized list of WIP, debt, and active development areas with file locations.

---

## Phase 5: Infer Engineering Conventions

Determine (with examples from the codebase):

- Naming conventions (files, types, components, variables)
- Folder organization and import rules
- Component or module patterns
- State management patterns
- API design conventions (routes, status codes, error shapes, pagination)
- Testing conventions (unit, integration, e2e; fixtures and factories)
- Error handling patterns
- Logging conventions
- Security practices (secrets handling, auth checks, input validation)
- Formatting and lint rules and how they are enforced

**Output:** A "Conventions" section with concrete examples (paths and snippets).

---

## Phase 6: Risk Analysis

Identify areas where changes require extra caution:

- Critical modules and sensitive business logic
- Authentication and authorization systems
- Payment or billing systems
- Database migrations and data integrity
- Permission models and role-based access
- Performance-sensitive paths
- Security-sensitive modules (crypto, sessions, tokens, file uploads)
- Operational hazards (background jobs, cron, webhooks)

**Output:** A "High-Risk Change Zones" list with recommended extra verification for each.

---

## Phase 7: Generate Project Memory Artifacts

Create two files in the project root (or a location specified by the user).

### 1. `AI_PROJECT_CONTEXT_REPORT.md`

Use [templates/AI_PROJECT_CONTEXT_REPORT.md.template](templates/AI_PROJECT_CONTEXT_REPORT.md.template) as the structure guide.

Must include:

- Project Overview
- Architecture Summary
- Technology Stack
- Major Features
- Development History
- Current Work In Progress
- Engineering Conventions
- Technical Debt
- Known Risks
- Recommended Development Workflow

Every major claim must have an evidence citation.

### 2. `AI_PROJECT_MEMORY.md`

Use [templates/AI_PROJECT_MEMORY.md.template](templates/AI_PROJECT_MEMORY.md.template) as the structure guide.

Optimized for future AI assistants. Keep it short and high-signal:

- What this project is
- How it is structured
- Critical decisions and constraints
- Conventions that are easy to violate
- Common pitfalls and footguns
- Active development areas
- "When touching X, also check Y" rules
- Verification checklist (commands and tests)

---

## Phase 8: Completion Gate

Before proposing any implementation:

1. Confirm both artifacts exist and are complete.
2. Provide a 5–10 bullet "What I now know" summary.
3. List the **top 3 uncertainties** (if any) and what evidence is missing.
4. Ask the user a single explicit question: **"Proceed to implementation?"**

Do not write or modify application source code until the user approves.

---

## Evidence Citation Format

Use this format for citations:

```text
[Fact] The API uses JWT authentication.
Evidence: src/middleware/auth.ts (lines 12–45), README.md ("Authentication" section)
```

```text
[Assumption] Background jobs run on Redis because BullMQ is listed in package.json.
Rationale: package.json lists bullmq; no worker entry point found yet — needs verification.
```

---

## Stack Add-ons (Optional)

Use these stack-specific checklists to avoid missing obvious sources of truth. Only apply the relevant subsection(s) for the current repo.

### PHP / Composer (generic)

Prioritize:

- `composer.json`, `composer.lock` (scripts, PHP version, packages)
- `phpunit.xml*`, `phpstan.neon*`, `psalm.xml*`, `.php-cs-fixer.php` (quality gates)
- `.env*`, `.env.example` (runtime config)
- `docker-compose*`, `ddev*`, `Makefile` (local dev entrypoints)

Commands to look for:

- `composer install`, `composer run <script>`

### TYPO3 (often Composer + DDEV)

Prioritize:

- `config/system/*` and `config/sites/*` (site + system config)
- `public/` (web root), `typo3conf/` (legacy config), `var/` (runtime)
- `packages/*` (extensions; custom vs vendor)
- Solr / search config (e.g. `ddev solrctl apply`, `apache-solr-for-typo3/solr`)
- Mask / content elements ownership (`mask/mask` and related configuration)

Commands to look for:

- `ddev start`, `ddev composer install`, `ddev typo3 cache:flush`, `ddev typo3 <command>`

### Laravel

Prioritize:

- `composer.json` scripts (often `php artisan`)
- `artisan`, `bootstrap/`, `config/`, `routes/` (HTTP + console interfaces)
- `database/migrations`, `database/seeders`, `database/factories` (data lifecycle)
- `.env.example` (required keys), `storage/` (runtime)

Commands to look for:

- `composer install`, `php artisan`, `php artisan test` (if configured)

### Node.js / Express

Prioritize:

- `package.json` scripts (`dev`, `start`, `test`, `lint`)
- `src/` entrypoint(s), route registration, middleware
- `.env.example`, config modules
- `Dockerfile`, `docker-compose*`, `.github/workflows/*`

Commands to look for:

- `npm|pnpm|yarn install`, `npm|pnpm|yarn test`, `npm|pnpm|yarn lint`

### Next.js

Prioritize:

- `next.config.*` (redirects/rewrites/experimental flags)
- `src/app/` (App Router) or `pages/` (Pages Router)
- `middleware.*` (auth boundaries)
- API layer: `app/api/*` or `pages/api/*`
- Type and lint configs: `tsconfig.json`, `eslint.config.*`

Commands to look for:

- `pnpm dev`, `pnpm lint`, `pnpm typecheck`, e2e (Playwright/Cypress) if present

### Python

Prioritize:

- `pyproject.toml` / `requirements.txt` / `poetry.lock` (dependencies, scripts)
- App entrypoints (e.g. `app/`, `src/`, `main.py`)
- Test config (e.g. `pytest.ini`, `tox.ini`, `noxfile.py`)
- Migration tools if present (e.g. Alembic: `alembic.ini`, `migrations/`)

Commands to look for:

- `python -m venv .venv`, `pip install -r requirements.txt`
- `pytest` (or `python -m pytest`)

---

## Optional: Bootstrap Persistent Context

If the project lacks human-maintained context files, recommend the team adopt:

- `PROJECT_CONTEXT.md` — from [templates/PROJECT_CONTEXT.md.template](templates/PROJECT_CONTEXT.md.template)
- `CLAUDE.md` or `AGENTS.md` — from [templates/CLAUDE.md.template](templates/CLAUDE.md.template)

These files should be kept up to date by the team as the durable source of truth.