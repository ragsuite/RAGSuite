# Slim Chroma HTTP sidecar — do NOT reuse docker/backend.Dockerfile (Torch/Playwright ~3GB).
# Keeps heartbeat light so compose healthchecks stay green on constrained hosts.
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Match backend/requirements.txt floor (chromadb>=1.5.9).
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir 'chromadb>=1.5.9' \
    && find /usr/local/lib/python*/site-packages -type d -name '__pycache__' -prune -exec rm -rf {} + \
    && rm -rf /root/.cache/pip

EXPOSE 8000

# Persist path is bind-mounted at /data/chroma by compose.
CMD ["chroma", "run", "--host", "0.0.0.0", "--port", "8000", "--path", "/data/chroma"]
