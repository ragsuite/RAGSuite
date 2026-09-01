"""
Project management API routes - Multi-project support
"""
import uuid
import logging
from fastapi import APIRouter, HTTPException, Depends, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, not_

logger = logging.getLogger(__name__)

from ..db import get_db
from ..auth import (
    get_current_user_required,
    get_project_id_or_user,
    get_accessible_project_ids,
    ensure_project_access,
    is_org_admin_user,
    require_project_permission,
    resolve_active_project,
    set_user_active_project,
)
from ..services.project_permissions import union_permissions, user_can_create_project
from ..models import User, Project, Organization, ProjectMember
from ..services.notification_service import create_notification
from ..services.audit_service import emit_audit
from ..services.db_vector_consistency import purge_project_after_db_delete
from ..services.project_deletion_service import delete_project_related_rows
from ..schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut, ProjectListResponse,
)

router = APIRouter(prefix="/api/v1/projects", tags=["Projects"])


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Create a new project"""
    if not current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization is required before creating a project",
        )
    org_admin = is_org_admin_user(db, current_user)
    if current_user.org_id and not org_admin:
        memberships = (
            db.query(ProjectMember)
            .filter(ProjectMember.user_id == current_user.id)
            .all()
        )
        workspace_permissions = union_permissions(m.permissions for m in memberships)
        if not user_can_create_project(workspace_permissions, is_org_admin=False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to create projects",
            )

    # Check if project name already exists for this user
    existing = db.query(Project).filter(
        and_(
            Project.org_id == current_user.org_id,
            Project.name == project_data.name
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project with name '{project_data.name}' already exists"
        )
    
    # If this is the first project, make it active
    org = db.query(Organization).filter(Organization.id == current_user.org_id).first()
    existing_projects = db.query(Project).filter(Project.org_id == current_user.org_id).count()
    if org and org.max_projects > 0 and existing_projects >= org.max_projects:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Organization project limit exceeded",
        )
    is_active = existing_projects == 0
    
    # Deactivate other projects if this one should be active
    if is_active:
        db.query(Project).filter(Project.org_id == current_user.org_id).update({"is_active": False})
    
    project = Project(
        name=project_data.name,
        description=project_data.description,
        owner_id=current_user.id,
        org_id=current_user.org_id,
        is_active=is_active
    )
    
    db.add(project)
    db.flush()
    if is_org_admin_user(db, current_user):
        db.add(
            ProjectMember(
                project_id=project.id,
                user_id=current_user.id,
                permissions=[
                    "project:read",
                    "project:write",
                    "crawl:manage",
                    "documents:manage",
                    "connectors:manage",
                    "chat:use",
                    "search:use",
                    "analytics:read",
                    "api_keys:manage",
                    "widgets:manage",
                    "settings:manage",
                ],
                granted_by=current_user.id,
            )
        )
    db.commit()
    db.refresh(project)
    
    # Create notification for project creation
    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Project Created",
            message=f"Project '{project.name}' has been created successfully" + (" and set as active." if is_active else "."),
            type="success",
            action_url="/projects"
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create project creation notification: {notif_error}")

    emit_audit(
        event_type="project.created",
        request=request,
        user_id=current_user.id,
        project_id=project.id,
        resource_type="project",
        resource_id=str(project.id),
        summary=f"Project created: {project.name}",
    )
    
    return project


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """List all projects for the current user (excludes temporary onboarding projects)"""
    # Filter out temporary onboarding projects
    project_ids = get_accessible_project_ids(db, current_user)
    if not project_ids:
        return ProjectListResponse(projects=[], total=0, active_project_id=None)
    projects = (
        db.query(Project)
        .filter(
            and_(
                Project.id.in_(project_ids),
                not_(Project.name.like("__TEMP_ONBOARDING_%")),
            )
        )
        .order_by(Project.created_at.desc())
        .all()
    )
    
    active_project = resolve_active_project(db, current_user)
    active_id = active_project.id if active_project else None

    membership_rows = (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == current_user.id, ProjectMember.project_id.in_(project_ids))
        .all()
    )
    permissions_by_project = {row.project_id: list(row.permissions or []) for row in membership_rows}
    org_admin = is_org_admin_user(db, current_user)

    workspace_permissions = (
        ["project:admin"]
        if org_admin
        else union_permissions(permissions_by_project.values())
    )
    active_permissions = (
        ["project:admin"]
        if org_admin and active_id
        else list(permissions_by_project.get(active_id, [])) if active_id else []
    )

    return ProjectListResponse(
        projects=[
            ProjectOut(
                id=project.id,
                name=project.name,
                description=project.description,
                owner_id=project.owner_id,
                is_active=project.id == active_id,
                created_at=project.created_at,
                updated_at=project.updated_at,
                permissions=(
                    ["project:admin"]
                    if org_admin
                    else list(permissions_by_project.get(project.id, []))
                ),
            )
            for project in projects
        ],
        total=len(projects),
        active_project_id=active_id,
        active_permissions=active_permissions,
        workspace_permissions=workspace_permissions,
        can_create_project=user_can_create_project(workspace_permissions, is_org_admin=org_admin),
    )


@router.get("/{project_uuid}", response_model=ProjectOut)
async def get_project(
    project_uuid: uuid.UUID,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """Get a specific project"""
    # Check access permission
    if auth_result["type"] == "widget":
        # Widgets can only access their own project
        if str(auth_result["project_id"]) != str(project_uuid):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Widget authentication mismatch for this project"
            )
        # Fetch project directly by ID (widget valid implies existence, but good to check)
        project = db.query(Project).filter(Project.id == project_uuid).first()
    else:
        # User access - check ACL visibility
        user = db.query(User).filter(User.id == auth_result["user_id"]).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        accessible_project_ids = get_accessible_project_ids(db, user)
        project = db.query(Project).filter(Project.id == project_uuid, Project.id.in_(accessible_project_ids)).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return project


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID,
    project_data: ProjectUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    _project_acl: Project = Depends(require_project_permission("project:write")),
):
    """Update a project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # If setting this project as active, deactivate others
    if project_data.is_active is True:
        db.query(Project).filter(and_(Project.org_id == current_user.org_id, Project.id != project_id)).update(
            {"is_active": False}
        )
    
    # Update fields
    was_activated = False
    for field, value in project_data.model_dump(exclude_unset=True).items():
        if field == "is_active" and value is True and not project.is_active:
            was_activated = True
        setattr(project, field, value)
    
    db.commit()
    db.refresh(project)
    
    # Create notification if project was activated
    if was_activated:
        try:
            create_notification(
                db=db,
                user_id=current_user.id,
                title="Project Activated",
                message=f"Project '{project.name}' has been activated and is now your active project.",
                type="info",
                action_url="/projects"
            )
        except Exception as notif_error:
            logger.warning(f"Failed to create project activation notification: {notif_error}")

    emit_audit(
        event_type="project.updated",
        request=request,
        user_id=current_user.id,
        project_id=project.id,
        resource_type="project",
        resource_id=str(project.id),
        summary=f"Project updated: {project.name}",
    )
    
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    _project_acl: Project = Depends(require_project_permission("project:admin")),
):
    """Delete a project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Prevent deleting the active project
    if project.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the active project. Please switch to another project first."
        )

    project_name = project.name

    # Record audit at account scope so it survives project cascade.
    try:
        emit_audit(
            event_type="project.deleted",
            request=request,
            user_id=current_user.id,
            project_id=None,
            resource_type="project",
            resource_id=str(project_id),
            summary=f"Project deleted: {project_name}",
            details={"project_id": str(project_id), "project_name": project_name},
            db=db,
        )
    except Exception as audit_error:
        logger.warning(f"Failed to record project deletion audit event: {audit_error}")

    try:
        delete_project_related_rows(db, project_id)
        db.commit()
    except Exception as delete_error:
        db.rollback()
        logger.error("Failed to delete project %s: %s", project_id, delete_error)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete project. Please try again.",
        ) from delete_error

    # Consistency-first ordering: relational delete is authoritative.
    # Purge vectors only after DB commit succeeds.
    try:
        deletion_success = purge_project_after_db_delete(str(project_id))
        if deletion_success:
            logger.info(
                "✅ Successfully deleted ChromaDB embeddings for project %s",
                project_id,
            )
        else:
            logger.warning(
                "⚠️ ChromaDB project purge may be incomplete for %s",
                project_id,
            )
    except Exception as e:
        logger.error(
            "❌ Error deleting ChromaDB embeddings for project %s: %s",
            project_id,
            e,
        )
    
    # Create notification for project deletion
    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Project Deleted",
            message=f"Project '{project_name}' has been deleted successfully.",
            type="info",
            action_url="/projects"
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create project deletion notification: {notif_error}")

    return None


@router.post("/{project_id}/activate", response_model=ProjectOut)
async def activate_project(
    project_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Activate a project for the current user's workspace context."""
    project = ensure_project_access(
        db,
        current_user,
        project_id,
        required_permission="project:read",
    )
    project = set_user_active_project(db, current_user, project)

    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Project Activated",
            message=f"Project '{project.name}' has been activated and is now your active project.",
            type="info",
            action_url="/projects",
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create project activation notification: {notif_error}")

    emit_audit(
        event_type="project.updated",
        request=request,
        user_id=current_user.id,
        project_id=project.id,
        resource_type="project",
        resource_id=str(project.id),
        summary=f"Project activated: {project.name}",
        details={"active_project_id": str(project.id)},
    )

    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        is_active=True,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
