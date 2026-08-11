#!/usr/bin/env bash
# Start Redis and Ollama if installed but not running (Coder / local dev).
set -euo pipefail

if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli ping >/dev/null 2>&1; then
    echo "Redis: already running"
  else
    redis-server --daemonize yes 2>/dev/null || true
    sleep 1
    if redis-cli ping >/dev/null 2>&1; then
      echo "Redis: started on localhost:6379"
    else
      echo "Redis: failed to start" >&2
      exit 1
    fi
  fi
else
  echo "Redis: not installed (apt install redis-server)" >&2
  exit 1
fi

if command -v ollama >/dev/null 2>&1; then
  if curl -sf -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "Ollama: already running"
  else
    nohup ollama serve >> "${HOME}/.ollama-serve.log" 2>&1 &
    sleep 2
    if curl -sf -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
      echo "Ollama: started on http://localhost:11434"
    else
      echo "Ollama: failed to start — see ~/.ollama-serve.log" >&2
      exit 1
    fi
  fi
else
  echo "Ollama: not installed" >&2
  exit 1
fi
