# DEPRECATED for this Server workspace.
# Canonical image build: /Users/arun/RAGSuite_Server/docker/backend.Dockerfile
# Kept so accidental `docker build -f backend/docker/Dockerfile` still works with
# backend/ as context (binds container port 8000 like the root Dockerfile).

FROM python:3.14.4-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    libpq-dev \
    libssl-dev \
    libffi-dev \
    libxml2-dev \
    libxslt-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN playwright install chromium --with-deps

COPY docker/entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl --fail --silent http://localhost:8000/api/v1/health/ping || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]
