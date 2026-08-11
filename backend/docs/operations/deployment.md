# RAGSuite — Deployment Guide

## Production Setup (GitLab CI/CD + Supervisor)

RAGSuite deploys to a single VPS managed by `supervisord`. The GitLab pipeline pushes to the `server` branch which triggers tests and deployment.

### Server Prerequisites

```bash
# Python 3.14 (Ubuntu 24.04/22.04: install via deadsnakes PPA first)
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
sudo apt install python3.14 python3.14-venv python3.14-dev

# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt install nodejs

# PostgreSQL
sudo apt install postgresql-15

# Redis
sudo apt install redis-server

# Supervisor
sudo apt install supervisor

# Nginx (if using static file serving)
sudo apt install nginx

# Playwright system deps (for JS crawling)
sudo apt install libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 libx11-6 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2
```

### First-Time Server Setup

```bash
# Clone repo
git clone <gitlab-repo-url> /home/web/ragsuite
cd /home/web/ragsuite

# Create Python venv
python3.14 -m venv /home/web/ragsuite/backend/.venv
/home/web/ragsuite/backend/.venv/bin/pip install -r backend/requirements.txt

# Install Playwright browsers
/home/web/ragsuite/backend/.venv/bin/playwright install chromium --with-deps

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with production values

# Run migrations
cd backend && /home/web/ragsuite/backend/.venv/bin/alembic upgrade head

# Install frontend deps
cd /home/web/ragsuite/frontend && npm ci && npm run build:all

# Install supervisor config
sudo cp configs/supervisor/ragsuite.conf /etc/supervisor/conf.d/ragsuite.conf
sudo supervisorctl reread && sudo supervisorctl update
sudo supervisorctl start ragsuite-backend
```

### GitLab CI/CD Variables

Set in GitLab → Settings → CI/CD → Variables:

| Variable | Description |
|---------|-------------|
| `PROD_ROOT` | Path to repo on server (default: `/home/web/ragsuite`) |
| `FRONTEND_DEPLOY_MODE` | `build` (production) or `dev` (Vite dev server) |
| `BACKUP_BEFORE_MIGRATE` | `true` to pg_dump before each migration |

### Pipeline Flow

```
Push to 'server' branch (or open MR — tests only)
    │
    ├── test:backend   (sync code, pytest in .ci-venv — not prod .venv)
    ├── test:frontend  (sync code, tsc + streaming markdown test)
    │
    ├── deploy:backend (needs: tests; resource_group: production)
    │     ├── sync origin/server
    │     ├── pip install → backend/.venv
    │     ├── backup_db.sh (if BACKUP_BEFORE_MIGRATE)
    │     ├── alembic upgrade head
    │     ├── scripts/restart-app.sh (Chroma + worker + API)
    │     └── scripts/health-check.sh
    │
    └── deploy:frontend (needs: deploy:backend)
          ├── npm ci
          └── npm run build:all  (or Vite dev mode)
```

### Nginx Configuration (Static Frontend)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Serve built frontend
    root /home/web/ragsuite/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

### Supervisor Management

```bash
# Check status
sudo supervisorctl status

# Restart backend
sudo supervisorctl restart ragsuite-backend

# View logs
tail -f /var/log/supervisor/ragsuite-backend.log
tail -f /var/log/supervisor/ragsuite-backend-error.log

# Reload config after changes
sudo supervisorctl reread && sudo supervisorctl update
```

### Database Backups

```bash
# Manual backup
pg_dump "$DATABASE_URL" > /var/backups/ragsuite-$(date +%F).sql

# Restore
psql "$DATABASE_URL" < /var/backups/ragsuite-2025-01-01.sql
```

Enable automatic backup before migrations:
```yaml
# In .gitlab-ci.yml variables or GitLab CI/CD variables
BACKUP_BEFORE_MIGRATE: "true"
```

## Docker Deployment (Alternative)

This repo ships two Docker deployment modes:

- `docker-compose.yml` for local/dev defaults
- `docker-compose.production.yml` override for production-safe defaults
  (no host-published Postgres/Redis, `DEBUG=False`, explicit URL/secret requirements)

```bash
# Copy and customize secrets at repo root
cp .env.example .env

# Local/dev stack
docker compose up --build

# Production-safe stack
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

- Web UI (nginx): http://localhost:9091
- API: http://localhost:9090
- Migrations run automatically on backend startup

Services: `postgres`, `redis`, `chromadb`, `backend` (gunicorn), `worker`, `frontend` (nginx).

Build individual images:

```bash
docker build -f docker/backend.Dockerfile -t ragsuite-backend .
docker build -f docker/frontend.Dockerfile -t ragsuite-frontend .
```

## Environment Checklist (Production)

- [ ] `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` are set and non-default
- [ ] `JWT_SECRET_KEY` is a long random string (min 32 chars)
- [ ] `CUSTOM_LLM_INTERNAL_API_KEY` is set
- [ ] `DEBUG=False`
- [ ] `CORS_ORIGINS` set to actual frontend domain (not `*`)
- [ ] `FRONTEND_BASE_URL` set to production URL
- [ ] `PUBLIC_API_BASE_URL` and `FRONTEND_API_URL` point to production API URL
- [ ] SMTP configured (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`)
- [ ] `CHROMA_PERSIST_PATH` set to absolute path outside repo
- [ ] Redis running and accessible
- [ ] Postgres/Redis host ports are not published publicly
- [ ] SSL certificate installed on nginx / edge proxy
- [ ] Firewall exposes only required public ports (typically 80/443/22)
- [ ] Regular database backups scheduled
