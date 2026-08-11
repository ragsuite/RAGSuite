import os

workers = int(os.environ.get("WEB_CONCURRENCY", 2))
worker_class = "uvicorn.workers.UvicornWorker"

# macOS fork safety — set before gunicorn.conf.py loads (see start.sh).
if os.uname().sysname == "Darwin":
    os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

bind = "0.0.0.0:8000"

# Must exceed the longest LLM call (10 min) plus margin
timeout = 660
keepalive = 5
graceful_timeout = 30

loglevel = "info"
accesslog = "-"
errorlog = "-"

# Restart workers after N requests to prevent memory leaks from embedding models
max_requests = 1000
max_requests_jitter = 100

proc_name = "ragsuite-backend"
