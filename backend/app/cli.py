"""Administrative CLI for backend bootstrap tasks."""

import argparse
from datetime import datetime, timezone

from app.auth import get_password_hash
from app.db import SessionLocal
from app.models import Organization, OrganizationMember, User


def bootstrap_org_admin(args: argparse.Namespace) -> None:
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.slug == args.org_slug).first()
        if not org:
            org = Organization(
                name=args.org_name,
                slug=args.org_slug,
                registration_enabled=False,
            )
            db.add(org)
            db.flush()

        existing = db.query(User).filter((User.username == args.username) | (User.email == args.email)).first()
        if existing:
            raise RuntimeError("User with the same username or email already exists")

        user = User(
            username=args.username,
            email=args.email,
            hashed_password=get_password_hash(args.password),
            is_active=True,
            is_admin=True,
            org_id=org.id,
            provisioned_by=None,
            must_change_password=False,
            auth_provider="local",
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()

        db.add(
            OrganizationMember(
                org_id=org.id,
                user_id=user.id,
                role="org_admin",
                is_active=True,
                invited_by=None,
                joined_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        print(f"Bootstrap complete. Organization={org.slug} Admin={user.username}")
    finally:
        db.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="RAGSuite backend admin CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    bootstrap = subparsers.add_parser("bootstrap-org-admin", help="Create org and first org admin")
    bootstrap.add_argument("--org-name", required=True)
    bootstrap.add_argument("--org-slug", required=True)
    bootstrap.add_argument("--email", required=True)
    bootstrap.add_argument("--username", required=True)
    bootstrap.add_argument("--password", required=True)
    bootstrap.set_defaults(handler=bootstrap_org_admin)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
