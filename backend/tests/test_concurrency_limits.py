"""WAITING crawl promotion loop."""
import uuid
from unittest.mock import MagicMock, patch

from app.services.concurrency_limits import promote_all_waiting_for_user


def test_promote_all_waiting_loops_until_cap_or_empty():
    db = MagicMock()
    project_id = uuid.uuid4()
    db.query.return_value.join.return_value.filter.return_value.distinct.return_value.all.return_value = [
        (project_id,)
    ]
    db.query.return_value.join.return_value.filter.return_value.count.return_value = 0

    with patch(
        "app.services.concurrency_limits._promote_waiting_crawl_for_project",
        side_effect=[True, True, False],
    ) as mock_promote:
        with patch("app.services.concurrency_limits.settings") as mock_settings:
            mock_settings.max_concurrent_crawls_per_project = 2
            mock_settings.waiting_crawl_alert_threshold = 10
            promoted = promote_all_waiting_for_user(db, user_id=1)

    assert promoted == 2
    assert mock_promote.call_count == 2
