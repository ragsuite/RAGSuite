"""add_chatbot_settings_table

Revision ID: c1d2e3f4a5b6
Revises: 29b9324931ef
Create Date: 2025-01-20 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c1d2e3f4a5b6'
down_revision = '29b9324931ef'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if table already exists
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    tables = inspector.get_table_names()
    
    table_exists = 'chatbot_settings' in tables
    
    if not table_exists:
        # Create chatbot_settings table
        op.create_table('chatbot_settings',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            
            # Chatbot Configuration Fields
            sa.Column('chatbot_title', sa.String(length=255), nullable=True, comment='Chatbot title'),
            sa.Column('short_description', sa.Text(), nullable=True, comment='Short description'),
            sa.Column('bubble_message', sa.String(length=200), nullable=True, comment='Bubble message'),
            sa.Column('welcome_message', sa.Text(), nullable=True, comment='Welcome message'),
            sa.Column('chatbot_language', sa.String(length=10), nullable=True, server_default='en', comment='Language code'),
            
            # Widget Customization Fields
            sa.Column('widget_logo_url', sa.Text(), nullable=True, comment='Widget logo URL or data URL'),
            sa.Column('widget_avatar', sa.Text(), nullable=True, comment='Widget avatar identifier or URL (can be base64 data URL)'),
            sa.Column('widget_avatar_size', sa.Integer(), nullable=True, server_default='38', comment='Avatar size in pixels'),
            sa.Column('widget_chatbot_color', sa.Text(), nullable=True, comment='Chatbot color (hex or gradient)'),
            sa.Column('widget_show_logo', sa.Boolean(), nullable=True, server_default='true', comment='Show logo in widget'),
            sa.Column('widget_show_date_time', sa.Boolean(), nullable=True, server_default='true', comment='Show date and time'),
            sa.Column('widget_bottom_space', sa.Integer(), nullable=True, server_default='15', comment='Bottom space in pixels'),
            sa.Column('widget_font_size', sa.Integer(), nullable=True, server_default='14', comment='Font size in pixels'),
            sa.Column('widget_trigger_border_radius', sa.Integer(), nullable=True, server_default='50', comment='Border radius for trigger button'),
            sa.Column('widget_position', sa.String(length=20), nullable=True, server_default='bottom-right', comment='Widget position'),
            sa.Column('widget_z_index', sa.Integer(), nullable=True, server_default='50', comment='Widget z-index'),
            sa.Column('widget_offset_x', sa.Integer(), nullable=True, server_default='0', comment='Widget X offset'),
            sa.Column('widget_offset_y', sa.Integer(), nullable=True, server_default='0', comment='Widget Y offset'),
            
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        )
    
    # Create indexes (only if they don't exist)
    indexes = []
    if table_exists:
        try:
            indexes = [idx['name'] for idx in inspector.get_indexes('chatbot_settings')]
        except Exception:
            indexes = []
    
    if 'ix_chatbot_settings_id' not in indexes:
        try:
            op.create_index(op.f('ix_chatbot_settings_id'), 'chatbot_settings', ['id'], unique=False)
        except Exception:
            pass  # Index might already exist
    
    if 'ix_chatbot_settings_user_id' not in indexes:
        try:
            op.create_index(op.f('ix_chatbot_settings_user_id'), 'chatbot_settings', ['user_id'], unique=True)
        except Exception:
            pass  # Index might already exist


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_chatbot_settings_user_id'), table_name='chatbot_settings')
    op.drop_index(op.f('ix_chatbot_settings_id'), table_name='chatbot_settings')
    
    # Drop table
    op.drop_table('chatbot_settings')

