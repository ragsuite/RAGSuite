"""add_project_id_to_chatbot_settings

Revision ID: 23aa1ccc4782
Revises: d2e3f4a5b6c7
Create Date: 2025-01-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '23aa1ccc4782'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if table exists
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    tables = inspector.get_table_names()
    
    if 'chatbot_settings' not in tables:
        # Table doesn't exist, skip
        return
    
    # CRITICAL: Drop the unique index/constraint on user_id FIRST, before checking for project_id
    # This must happen regardless of whether project_id exists, in case migration was partially run
    
    # Try to drop the specific unique index that's causing the error
    try:
        op.drop_index('ix_chatbot_settings_user_id', table_name='chatbot_settings')
    except Exception:
        # Index might not exist, try other methods
        pass
    
    # Remove the old unique constraint on user_id if it exists
    constraints = inspector.get_unique_constraints('chatbot_settings')
    for constraint in constraints:
        if 'user_id' in constraint['column_names'] and len(constraint['column_names']) == 1:
            try:
                op.drop_constraint(constraint['name'], 'chatbot_settings', type_='unique')
            except Exception as e:
                print(f"Warning: Could not drop constraint {constraint['name']}: {e}")
    
    # Also check for unique indexes (not just constraints)
    indexes = inspector.get_indexes('chatbot_settings')
    for index in indexes:
        if index['unique'] and 'user_id' in index['column_names'] and len(index['column_names']) == 1:
            try:
                op.drop_index(index['name'], table_name='chatbot_settings')
            except Exception as e:
                print(f"Warning: Could not drop index {index['name']}: {e}")
    
    # Check if project_id column already exists
    columns = {col['name']: col for col in inspector.get_columns('chatbot_settings')}
    
    if 'project_id' not in columns:
        
        # Add project_id column (nullable first to allow existing rows)
        op.add_column('chatbot_settings',
            sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True)
        )
        
        # For existing rows, we need to assign a project_id
        # Use raw SQL with proper error handling
        try:
            # First, try to assign active projects
            connection.execute(sa.text("""
                UPDATE chatbot_settings cs
                SET project_id = (
                    SELECT p.id
                    FROM projects p
                    WHERE p.owner_id = cs.user_id
                    AND p.is_active = true
                    LIMIT 1
                )
                WHERE cs.project_id IS NULL
            """))
            connection.commit()
        except Exception as e:
            print(f"Warning: Could not update with active projects: {e}")
            connection.rollback()
        
        try:
            # If still null (no active project), get any project for the user
            connection.execute(sa.text("""
                UPDATE chatbot_settings cs
                SET project_id = (
                    SELECT p.id
                    FROM projects p
                    WHERE p.owner_id = cs.user_id
                    LIMIT 1
                )
                WHERE cs.project_id IS NULL
            """))
            connection.commit()
        except Exception as e:
            print(f"Warning: Could not update with any project: {e}")
            connection.rollback()
        
        # Check if there are still NULL project_ids
        result = connection.execute(sa.text("SELECT COUNT(*) FROM chatbot_settings WHERE project_id IS NULL"))
        null_count = result.scalar()
        
        if null_count > 0:
            # Create default projects for users without projects
            print(f"Warning: {null_count} chatbot_settings records have no project. Creating default projects...")
            try:
                # Get distinct user_ids with NULL project_id
                result = connection.execute(sa.text("""
                    SELECT DISTINCT user_id 
                    FROM chatbot_settings 
                    WHERE project_id IS NULL
                """))
                user_ids = [row[0] for row in result.fetchall()]
                
                for user_id in user_ids:
                    # Create a default project for this user
                    default_project_id = connection.execute(sa.text("""
                        INSERT INTO projects (id, name, description, owner_id, is_active, created_at, updated_at)
                        VALUES (gen_random_uuid(), 'Main Project', 'Default project', :user_id, true, now(), now())
                        RETURNING id
                    """), {"user_id": user_id}).scalar()
                    
                    # Update chatbot_settings for this user
                    connection.execute(sa.text("""
                        UPDATE chatbot_settings
                        SET project_id = :project_id
                        WHERE user_id = :user_id AND project_id IS NULL
                    """), {"project_id": default_project_id, "user_id": user_id})
                
                connection.commit()
            except Exception as e:
                print(f"Error creating default projects: {e}")
                connection.rollback()
                # If we can't create projects, we need to delete orphaned records or make project_id nullable
                # For now, let's delete orphaned records
                connection.execute(sa.text("DELETE FROM chatbot_settings WHERE project_id IS NULL"))
                connection.commit()
        
        # Now make it NOT NULL
        op.alter_column('chatbot_settings', 'project_id',
                      existing_type=postgresql.UUID(as_uuid=True),
                      nullable=False)
        
        # Add foreign key constraint
        op.create_foreign_key(
            'fk_chatbot_settings_project_id',
            'chatbot_settings', 'projects',
            ['project_id'], ['id']
        )
        
        # Create index
        op.create_index(op.f('ix_chatbot_settings_project_id'), 'chatbot_settings', ['project_id'], unique=False)
    
    # Add new composite unique constraint on (user_id, project_id)
    # Check if constraint already exists
    constraints = inspector.get_unique_constraints('chatbot_settings')
    constraint_exists = any(
        set(constraint['column_names']) == {'user_id', 'project_id'}
        for constraint in constraints
    )
    
    if not constraint_exists:
        try:
            op.create_unique_constraint('uq_chatbot_settings_user_project', 'chatbot_settings', ['user_id', 'project_id'])
        except Exception as e:
            print(f"Warning: Could not create unique constraint: {e}")


def downgrade() -> None:
    # Remove the composite unique constraint
    try:
        op.drop_constraint('uq_chatbot_settings_user_project', 'chatbot_settings', type_='unique')
    except Exception:
        pass
    
    # Restore the old unique constraint on user_id
    try:
        op.create_unique_constraint('chatbot_settings_user_id_key', 'chatbot_settings', ['user_id'])
    except Exception:
        pass
    
    # Remove foreign key, index, and column
    try:
        op.drop_constraint('fk_chatbot_settings_project_id', 'chatbot_settings', type_='foreignkey')
    except Exception:
        pass
    
    try:
        op.drop_index(op.f('ix_chatbot_settings_project_id'), table_name='chatbot_settings')
    except Exception:
        pass
    
    try:
        op.drop_column('chatbot_settings', 'project_id')
    except Exception:
        pass
