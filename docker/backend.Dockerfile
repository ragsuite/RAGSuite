FROM python:3.14.4-slim

WORKDIR /app

# System deps for Scrapy, Playwright, Pillow, Postgres
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

COPY backend/requirements.txt .

# CPU-only PyTorch first. Without this, pip pulls multi-GB CUDA / nvidia-* wheels
# (especially on aarch64) and the image build runs out of disk.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        torch \
    && pip install --no-cache-dir -r requirements.txt \
    && find /usr/local/lib/python*/site-packages -type d -name '__pycache__' -prune -exec rm -rf {} + \
    && rm -rf /root/.cache/pip

# Playwright browsers (JS-rendered crawl)
RUN playwright install chromium --with-deps \
    && rm -rf /var/lib/apt/lists/* /tmp/*

COPY docker/backend-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Backend package at /app (historical layout). CE modules + installed EE bundle
# live alongside so extension_loader can discover them (repo_root → /app).
COPY backend/ .
COPY modules/ /app/modules/
COPY extensions/ /app/extensions/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl --fail --silent http://localhost:8000/api/v1/health/ping || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]
