"""Analytics dashboard build and report export tests."""
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, ChatMessage, Project, QueryLog, QueryMode, User
from app.services.analytics_dashboard import (
    build_analytics_dashboard_data,
    dashboard_to_export_payload,
    normalize_period_dates,
    render_analytics_export_csv,
)

pytestmark = pytest.mark.ee


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    user = User(
        username="analyticsuser",
        email="analytics@test.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
    )
    session.add(user)
    session.commit()
    project = Project(
        id=uuid.uuid4(),
        name="Test Project",
        owner_id=user.id,
        is_active=True,
    )
    session.add(project)
    session.commit()
    yield session, project
    session.close()


def test_normalize_period_dates_7d():
    _, start, end, prev_start, prev_end = normalize_period_dates("7d")
    assert (end - start).days == 7
    assert (prev_end - prev_start).days == 7
    assert prev_end == start


def test_build_dashboard_and_export_csv(db_session):
    session, project = db_session
    now = datetime.now(timezone.utc)
    for i in range(3):
        session.add(
            QueryLog(
                project_id=project.id,
                query=f"test query {i}",
                mode=QueryMode.SEARCH,
                p95_latency=100 + i,
                result_count=5,
                timestamp=now - timedelta(days=i),
            )
        )
    session.add(
        ChatMessage(
            project_id=project.id,
            session_id="sess-1",
            message_id=uuid.uuid4(),
            user_message="hello world",
            assistant_response="hi",
            message_type="chat",
            feedback=True,
            created_at=now,
        )
    )
    session.commit()

    dashboard = build_analytics_dashboard_data(session, project, "7d")
    assert dashboard.metrics.totalQueries >= 3
    assert len(dashboard.dailyQueries) == 7

    _, start_date, end_date, _, _ = normalize_period_dates("7d")
    payload = dashboard_to_export_payload(dashboard, project, start_date, end_date)
    csv_text = render_analytics_export_csv(payload)

    assert "# Metadata" in csv_text
    assert "# Summary metrics" in csv_text
    assert "total_queries" in csv_text
    assert "# Daily queries" in csv_text
    assert "# Popular queries" in csv_text
    assert "Test Project" in csv_text
    assert payload["meta"]["timeRange"] == "7d"
