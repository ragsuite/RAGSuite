"""Background job fair-queue claim."""
from unittest.mock import MagicMock, patch

from app.services.job_queue import _claim_next_jobs


def test_claim_next_jobs_fair_round_robin_uses_skip_locked():
    """Fair claim: tenant scan via SQL, per-tenant claim with SKIP LOCKED."""
    db = MagicMock()
    execute_result = MagicMock()
    execute_result.fetchall.return_value = [(42,)]
    db.execute.return_value = execute_result

    job = MagicMock()
    job.id = "job-1"
    job.job_type = "DOCUMENT_INGEST"
    job.project_id = None
    job.attempts = 0

    tenant_query = MagicMock()
    tenant_filtered = MagicMock()
    tenant_ordered = MagicMock()
    tenant_locked = MagicMock()
    tenant_locked.first.return_value = job

    sys_query = MagicMock()
    sys_filtered = MagicMock()
    sys_ordered = MagicMock()
    sys_limited = MagicMock()
    sys_locked = MagicMock()
    sys_locked.all.return_value = []

    db.query.side_effect = [tenant_query, sys_query]

    tenant_query.filter.return_value = tenant_filtered
    tenant_filtered.order_by.return_value = tenant_ordered
    tenant_ordered.with_for_update.return_value = tenant_locked

    sys_query.filter.return_value = sys_filtered
    sys_filtered.order_by.return_value = sys_ordered
    sys_ordered.limit.return_value = sys_limited
    sys_limited.with_for_update.return_value = sys_locked

    with patch("app.services.admission.get_crawl_running", return_value=0):
        with patch("app.services.admission.get_ingest_active", return_value=0):
            with patch("app.services.job_queue._get_org_cap", return_value=2):
                claimed = _claim_next_jobs(db, 3)

    assert len(claimed) == 1
    tenant_ordered.with_for_update.assert_called_once_with(skip_locked=True)
    assert job.status == "RUNNING"
