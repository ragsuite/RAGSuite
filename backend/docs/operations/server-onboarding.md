# RAGSuite — Server Onboarding (after git clone)

Default install path: `/home/web/ragsuite`  
Change `PROD_ROOT` if you use another path.

---

## 1. Install system packages (Ubuntu)

```bash
sudo apt update
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.14 python3.14-venv python3.14-dev \
  postgresql redis-server supervisor nginx git curl \
  libpq-dev gcc libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 libx11-6 libxcomposite1 \
  libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

Optional (default embeddings use Ollama):

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull jina/jina-embeddings-v2-base-de
```

---

## 2. Clone repo

```bash
export PROD_ROOT=/home/web/ragsuite
sudo mkdir -p "$(dirname "$PROD_ROOT")"
sudo git clone <repo-url> "$PROD_ROOT"
sudo chown -R "$USER:$USER" "$PROD_ROOT"
cd "$PROD_ROOT"
```

---

## 3. Create PostgreSQL database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER ragsuite WITH PASSWORD 'CHANGE_ME';
CREATE DATABASE rag_suite OWNER ragsuite;
GRANT ALL PRIVILEGES ON DATABASE rag_suite TO ragsuite;
SQL
```

---

## 4. Configure environment

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Set at minimum:

```bash
DATABASE_URL=postgresql://ragsuite:CHANGE_ME@localhost:5432/rag_suite
JWT_SECRET_KEY=<long-random-string>
CUSTOM_LLM_INTERNAL_API_KEY=<long-random-string>
DEBUG=False
FRONTEND_BASE_URL=https://your-domain.example.com
CORS_ORIGINS=https://your-domain.example.com
CHROMA_PERSIST_PATH=/home/web/ragsuite/chroma_db
CHROMA_MODE=http
CHROMA_HOST=127.0.0.1
CHROMA_PORT=8001
RUN_INLINE_WORKER=false
```

Create data dirs:

```bash
mkdir -p /home/web/ragsuite/chroma_db
mkdir -p /var/backups/ragsuite
```

---

## 5. Bootstrap app

```bash
cd "$PROD_ROOT"
bash scripts/setup.sh
```

---

## 6. Build frontend

```bash
cd "$PROD_ROOT/frontend"
npm ci
npm run build:all
```

---

## 7. Start services with Supervisor

```bash
# Edit paths in configs/supervisor/ragsuite.conf if PROD_ROOT is not /home/web/ragsuite
sudo cp configs/supervisor/ragsuite.conf /etc/supervisor/conf.d/ragsuite.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start ragsuite:*
sudo supervisorctl status
```

Check health:

```bash
bash scripts/health-check.sh
curl http://localhost:8000/api/v1/health/ping
```

---

## 8. Nginx (HTTPS reverse proxy)

Point nginx to:
- frontend static files: `$PROD_ROOT/frontend/dist`
- API proxy: `http://127.0.0.1:8000`

Reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. Deploy updates (after first setup)

```bash
cd "$PROD_ROOT"
git pull
bash scripts/deploy.sh
```

Or with options:

```bash
bash scripts/deploy.sh --sync
bash scripts/deploy.sh --skip-frontend
```

---

## 10. Useful ops commands

```bash
# Logs
sudo supervisorctl status
tail -f /var/log/supervisor/ragsuite-backend.log
tail -f /var/log/supervisor/ragsuite-worker.log

# Restart app
bash scripts/restart-app.sh

# DB backup
export DATABASE_URL=postgresql://ragsuite:CHANGE_ME@localhost:5432/rag_suite
BACKUP_DIR=/var/backups/ragsuite bash backend/scripts/backup_db.sh

# DB migrate only
cd backend && .venv/bin/alembic upgrade head
```

---

## Docker + Traefik server (keeen style)

If host uses Traefik (not nginx/supervisor), you still need the same data services:
Postgres, Redis, Chroma, worker, API, built frontend.

Run Docker as `k3n-admin`:

```bash
ssh root@rag.keeen.net
sudo -u k3n-admin bash
mkdir -p /home/k3n-admin/docker/rag-<client>
cd /home/k3n-admin/docker/rag-<client>
# create docker-compose.yml with traefik labels + persistent volumes
docker compose up -d
docker compose logs -f
```

Traefik labels must include:
- `traefik.enable=true`
- `traefik.docker.network=proxy`
- `Host(\`your.domain.keeen.net\`)`
- `entrypoints=websecure`, `tls=true`, `tls.certresolver=myresolver`
- `loadbalancer.server.port=<app-port>`

Do not expose host ports; DNS must be ready before first HTTPS test.
