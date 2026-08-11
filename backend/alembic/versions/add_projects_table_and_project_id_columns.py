"""add_projects_table_and_project_id_columns

Revision ID: add_projects_support
Revises: 6e4a9c94102a
Create Date: 2025-01-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = 'add_projects_support'
down_revision = '6e4a9c94102a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    
    # Check if projects table exists
    inspector = sa.inspect(connection)
    tables = inspector.get_table_names()
    projects_table_existed = 'projects' in tables
    
    # Create projects table if it doesn't exist
    if not projects_table_existed:
        op.create_table('projects',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('owner_id', sa.Integer(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_projects_id'), 'projects', ['id'], unique=False)
        op.create_index(op.f('ix_projects_name'), 'projects', ['name'], unique=False)
        op.create_index(op.f('ix_projects_owner_id'), 'projects', ['owner_id'], unique=False)
        op.create_index(op.f('ix_projects_is_active'), 'projects', ['is_active'], unique=False)
    
    # Refresh inspector after table creation
    inspector = sa.inspect(connection)
    tables = inspector.get_table_names()
    
    # Add project_id columns as nullable first (only if they don't exist)
    for table_name in ['crawl_sources', 'uploaded_documents', 'chat_messages']:
        if table_name in tables:
            columns = [col['name'] for col in inspector.get_columns(table_name)]
            if 'project_id' not in columns:
                op.add_column(table_name, sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Create default "Main Project" for each existing user (if projects table was just created)
    # This ensures all existing data has a project to belong to
    if not projects_table_existed:
        result = connection.execute(sa.text("SELECT id FROM users"))
        users = result.fetchall()
        
        for user_id, in users:
            # Check if user already has a project
            existing_project = connection.execute(sa.text("""
                SELECT id FROM projects WHERE owner_id = :user_id LIMIT 1
            """), {"user_id": user_id}).fetchone()
            
            if not existing_project:
                project_id = str(uuid.uuid4())
                connection.execute(sa.text("""
                    INSERT INTO projects (id, name, description, owner_id, is_active, created_at, updated_at)
                    VALUES (:project_id, 'Main Project', 'Default project for existing data', :user_id, true, now(), now())
                """), {"project_id": project_id, "user_id": user_id})
    
    # Assign existing data to projects for users who don't have project_id set
    for table_name, user_col in [('crawl_sources', 'created_by_id'), ('uploaded_documents', 'user_id'), ('chat_messages', 'user_id')]:
        if table_name in tables:
            columns = [col['name'] for col in inspector.get_columns(table_name)]
            if 'project_id' in columns:
                # Update records with NULL project_id
                connection.execute(sa.text(f"""
                    UPDATE {table_name} 
                    SET project_id = (
                        SELECT id FROM projects 
                        WHERE projects.owner_id = {table_name}.{user_col} 
                        LIMIT 1
                    )
                    WHERE project_id IS NULL
                """))
    
    # Now make the columns non-nullable (only if they exist and are nullable)
    for table_name in ['crawl_sources', 'uploaded_documents', 'chat_messages']:
        if table_name in tables:
            columns = {col['name']: col for col in inspector.get_columns(table_name)}
            if 'project_id' in columns and columns['project_id']['nullable']:
                op.alter_column(table_name, 'project_id', nullable=False)
    
    # Create indexes and foreign keys (only if they don't exist)
    def create_index_if_not_exists(index_name, table_name, columns):
        indexes = [idx['name'] for idx in inspector.get_indexes(table_name)]
        if index_name not in indexes:
            op.create_index(index_name, table_name, columns, unique=False)
    
    def create_fk_if_not_exists(fk_name, table_name, ref_table, columns, ref_columns):
        fks = [fk['name'] for fk in inspector.get_foreign_keys(table_name)]
        if fk_name not in fks:
            op.create_foreign_key(fk_name, table_name, ref_table, columns, ref_columns)
    
    for table_name, fk_name, index_name in [
        ('crawl_sources', 'fk_crawl_sources_project_id', 'ix_crawl_sources_project_id'),
        ('uploaded_documents', 'fk_uploaded_documents_project_id', 'ix_uploaded_documents_project_id'),
        ('chat_messages', 'fk_chat_messages_project_id', 'ix_chat_messages_project_id'),
    ]:
        if table_name in tables:
            columns = [col['name'] for col in inspector.get_columns(table_name)]
            if 'project_id' in columns:
                create_index_if_not_exists(index_name, table_name, ['project_id'])
                create_fk_if_not_exists(fk_name, table_name, 'projects', ['project_id'], ['id'])
    
    # Add project_id to query_logs, analytics_days, api_keys (nullable)
    for table_name, fk_name, index_name in [
        ('query_logs', 'fk_query_logs_project_id', 'ix_query_logs_project_id'),
        ('analytics_days', 'fk_analytics_days_project_id', 'ix_analytics_days_project_id'),
        ('api_keys', 'fk_api_keys_project_id', 'ix_api_keys_project_id'),
    ]:
        if table_name in tables:
            columns = [col['name'] for col in inspector.get_columns(table_name)]
            if 'project_id' not in columns:
                op.add_column(table_name, sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True))
                create_index_if_not_exists(index_name, table_name, ['project_id'])
                create_fk_if_not_exists(fk_name, table_name, 'projects', ['project_id'], ['id'])


def downgrade() -> None:
    # Remove project_id columns
    op.drop_constraint('fk_api_keys_project_id', 'api_keys', type_='foreignkey')
    op.drop_index(op.f('ix_api_keys_project_id'), table_name='api_keys')
    op.drop_column('api_keys', 'project_id')
    
    op.drop_constraint('fk_analytics_days_project_id', 'analytics_days', type_='foreignkey')
    op.drop_index(op.f('ix_analytics_days_project_id'), table_name='analytics_days')
    op.drop_column('analytics_days', 'project_id')
    
    op.drop_constraint('fk_query_logs_project_id', 'query_logs', type_='foreignkey')
    op.drop_index(op.f('ix_query_logs_project_id'), table_name='query_logs')
    op.drop_column('query_logs', 'project_id')
    
    op.drop_constraint('fk_chat_messages_project_id', 'chat_messages', type_='foreignkey')
    op.drop_index(op.f('ix_chat_messages_project_id'), table_name='chat_messages')
    op.drop_column('chat_messages', 'project_id')
    
    op.drop_constraint('fk_uploaded_documents_project_id', 'uploaded_documents', type_='foreignkey')
    op.drop_index(op.f('ix_uploaded_documents_project_id'), table_name='uploaded_documents')
    op.drop_column('uploaded_documents', 'project_id')
    
    op.drop_constraint('fk_crawl_sources_project_id', 'crawl_sources', type_='foreignkey')
    op.drop_index(op.f('ix_crawl_sources_project_id'), table_name='crawl_sources')
    op.drop_column('crawl_sources', 'project_id')
    
    # Drop projects table
    op.drop_index(op.f('ix_projects_is_active'), table_name='projects')
    op.drop_index(op.f('ix_projects_owner_id'), table_name='projects')
    op.drop_index(op.f('ix_projects_name'), table_name='projects')
    op.drop_index(op.f('ix_projects_id'), table_name='projects')
    op.drop_table('projects')

