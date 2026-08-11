from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Organization, Settings, User
from app.routes.settings import get_settings


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.mark.asyncio
async def test_get_settings_reconciles_default_name_from_organization(db_session):
    org = Organization(name="Nitsan Tech", slug="nitsan-tech")
    db_session.add(org)
    db_session.flush()

    user = User(
        username="orgadmin",
        email="orgadmin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    db_session.flush()

    db_session.add(
        Settings(
            user_id=user.id,
            org_name="Default Organization",
            logo_data_url=None,
            primary_color="#2E6A4E",
        )
    )
    db_session.commit()

    response = await get_settings(
        db=db_session,
        auth={"type": "user", "user": user, "user_id": user.id},
    )
    assert response.org_name == "Nitsan Tech"

    stored = db_session.query(Settings).filter(Settings.user_id == user.id).first()
    assert stored is not None
    assert stored.org_name == "Nitsan Tech"
