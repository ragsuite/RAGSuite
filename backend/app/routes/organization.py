"""Organization routes — CE team-admin always; EE extras when the organization module is attached."""
from __future__ import annotations

from app.routes.org_team import (  # noqa: F401
    complete_invite_setup,
    create_org_user,
    deactivate_org_user,
    list_org_users,
    preview_invite_setup,
    router,
    update_org_user,
)

# Re-export invite email symbols so legacy tests can patch ``app.routes.organization.*``.
from app.services.org_team import send_org_invite_email  # noqa: F401
from app.services.transactional_email import smtp_configured, smtp_delivery_ready  # noqa: F401

try:
    from ragsuite_modules.organization.backend.routes import (  # noqa: F401
        create_org_project,
        get_organization,
        get_org_sso_config,
        list_org_projects,
        list_org_user_projects,
        replace_org_user_projects,
        test_org_sso_config,
        update_organization,
        upsert_org_sso_config,
        _resolve_org_display_name,
    )
    from ragsuite_modules.organization.backend.group_routes import (  # noqa: F401
        add_org_user_group_member,
        create_org_user_group,
        delete_org_user_group,
        get_org_user_group,
        list_org_user_group_members,
        list_org_user_group_projects,
        list_org_user_groups,
        remove_org_user_group_member,
        replace_org_user_group_members,
        replace_org_user_group_projects,
        update_org_user_group,
    )
except ImportError:
    pass
