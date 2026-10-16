#!/usr/bin/env bash
# Run ON THE PRODUCTION SERVER from repo root to debug embedding / reindex issues.
#
#   bash scripts/server_embedding_diag.sh
#   bash scripts/server_embedding_diag.sh <project-uuid>
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$REPO_ROOT/.venv/bin/python"
PROJECT_ID="${1:-}"

echo "========== RAGSuite embedding diagnostic =========="
echo "Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Repo: $REPO_ROOT"
echo ""

if [ ! -x "$REPO_ROOT/.venv/bin/python" ]; then
  echo "ERROR: venv not found at $REPO_ROOT/.venv"
  exit 1
fi

echo "==> 1. Supervisor processes"
if command -v supervisorctl >/dev/null 2>&1; then
  sudo supervisorctl status ragsuite-worker ragsuite-backend 2>/dev/null || \
    supervisorctl status ragsuite-worker ragsuite-backend 2>/dev/null || \
    echo "  (supervisor programs not found)"
else
  echo "  supervisorctl not installed"
fi
echo ""

echo "==> 2. Embedding / vector env (from .env)"
grep -E '^(VECTOR_|PGVECTOR_|EMBEDDING_PREFERRED_SOURCE|RUN_INLINE_WORKER)=' "$REPO_ROOT/.env" 2>/dev/null || echo "  (defaults — no overrides in .env)"
echo ""

echo "==> 3. Legacy Chroma data directories (one-time pgvector import source)"
for d in /home/web/ragsuite_backend/chroma_db "$REPO_ROOT/rag_db_local" "$REPO_ROOT/chroma_db"; do
  if [ -d "$d" ]; then
    du -sh "$d" 2>/dev/null | awk -v p="$d" '{print "  " p ": " $1}'
  fi
done
echo ""

echo "==> 4. Vector store (pgvector)"
(cd "$REPO_ROOT" && OTEL_SDK_DISABLED=true "$VENV" - <<'PY'
from app.services.rag.vector_store.health import vector_store_status
s = vector_store_status(include_counts=True)
print(f"  pgvector={s.get('pgvector_version') or 'MISSING'} healthy={s.get('healthy')} ({s.get('message', '')})")
for c in s.get("collections", []):
    print(f"  {c['collection']}: rows={c['count']} dim={c['dim']} index={c.get('status')}")
PY
) || echo "  ERROR: vector store check failed"
echo ""

echo "==> 5. API health"
if curl -sf -m 5 "http://127.0.0.1:9090/api/v1/health/ping" >/dev/null 2>&1; then
  echo "  API OK"
else
  echo "  WARNING: API not responding on :9090"
fi
echo ""

echo "==> 6. Git commit (is latest code deployed?)"
git -C "$REPO_ROOT" log -1 --oneline 2>/dev/null || true
echo ""

echo "==> 7. Database: chat embedding settings per project"
cd "$REPO_ROOT"
"$VENV" <<'PY'
import os
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
from app.db import SessionLocal
from app.models import Project, ChatbotSettings, ReindexJob

db = SessionLocal()
try:
    rows = (
        db.query(Project, ChatbotSettings)
        .outerjoin(ChatbotSettings, ChatbotSettings.project_id == Project.id)
        .order_by(Project.name)
        .all()
    )
    print(f"  {'PROJECT':<28} {'PROVIDER':<10} {'EMBEDDING':<28} {'API_KEY':<8} {'REINDEX':<12}")
    print("  " + "-" * 90)
    for proj, cs in rows:
        name = (proj.name or "")[:27]
        if not cs:
            print(f"  {name:<28} {'—':<10} {'—':<28} {'—':<8} {'—':<12}")
            continue
        prov = (cs.model_provider or "—")[:9]
        emb = (cs.embedding_model or "—")[:27]
        key = "yes" if cs.api_key and str(cs.api_key).strip() else "MISSING"
        job = (
            db.query(ReindexJob)
            .filter(ReindexJob.project_id == proj.id, ReindexJob.source == "chat")
            .first()
        )
        rj = f"{job.status}" if job else "—"
        if job and job.error:
            rj += f" err={str(job.error)[:40]}"
        print(f"  {name:<28} {prov:<10} {emb:<28} {key:<8} {rj:<12}")
        print(f"    project_id={proj.id}")
finally:
    db.close()
PY
echo ""

if [ -n "$PROJECT_ID" ]; then
  echo "==> 8. Stored vectors for project $PROJECT_ID"
  "$VENV" "$REPO_ROOT/scripts/check_embedding_storage.py" "$PROJECT_ID" --source chat
  echo ""
fi

echo "==> 9. Recent worker errors (reindex / embed / vector)"
for log in /var/log/supervisor/ragsuite-worker-error.log /var/log/supervisor/ragsuite-worker.log \
           /var/log/supervisor/ragsuite-backend-error.log; do
  if [ -f "$log" ]; then
    echo "  --- $log (last 15 matching lines) ---"
    grep -iE 'reindex|embed|vector|pgvector|openai|failed|error|No chunks|fallback' "$log" 2>/dev/null | tail -15 || echo "  (no matches)"
  fi
done
echo ""
echo "========== Done =========="
echo ""
echo "If API_KEY=MISSING for OpenAI/Mistral → save API key in Chat Model Settings."
echo "If vectors=0 but crawl exists → check worker log; reindex may be failing."
echo "If pgvector MISSING → install the pgvector extension in Postgres, then rerun migrations."
echo "If git commit is old → bash scripts/deploy.sh --sync"
