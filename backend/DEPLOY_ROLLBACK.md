# RAGSuite deploy rollback

## Before each production deploy

1. Confirm `backend/.venv` exists on the server (used by GitLab CI via `PROD_VENV_BIN`).
2. Optional: set `BACKUP_BEFORE_MIGRATE=true` in CI variables to run `pg_dump` before `alembic upgrade head`.

## Roll back application code

```bash
cd /home/web/ragsuite
git fetch origin server
git checkout server
git reset --hard <previous-commit-sha>
bash scripts/restart-app.sh
bash scripts/health-check.sh
```

For frontend, redeploy the previous build artifact or set `FRONTEND_DEPLOY_MODE=dev` temporarily.

## Roll back database (only if last migration is reversible)

```bash
cd /home/web/ragsuite/backend
.venv/bin/alembic downgrade -1
sudo supervisorctl restart ragsuite-backend
```

If downgrade is not available, restore from backup:

```bash
psql "$DATABASE_URL" < /var/backups/ragsuite-pre-migrate-YYYY-MM-DD.sql
```

## Verify after rollback

- `curl -s http://localhost:9090/api/v1/health`
- `curl -s http://localhost:9090/api/v1/health/ready`
- Start a test crawl and confirm a single `run_crawl` in logs.
