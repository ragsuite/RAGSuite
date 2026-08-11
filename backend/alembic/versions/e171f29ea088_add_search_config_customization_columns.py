"""add_search_config_customization_columns

Revision ID: e171f29ea088
Revises: c56a6776a4b8
Create Date: 2026-01-01 12:51:06.082765

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'e171f29ea088'
down_revision = 'c56a6776a4b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Search Configuration columns
    op.add_column('search_settings', sa.Column('search_title', sa.String(255), nullable=True, comment='Search box title'))
    op.add_column('search_settings', sa.Column('search_style_option', sa.String(50), nullable=True, server_default='plugin', comment='Style option: default or plugin'))
    op.add_column('search_settings', sa.Column('search_box_layout', sa.String(50), nullable=True, server_default='box', comment='Box layout: box or fullwidth'))
    op.add_column('search_settings', sa.Column('search_icon', sa.String(50), nullable=True, server_default='search', comment='Search icon: search, scan, or sparkles'))
    op.add_column('search_settings', sa.Column('search_loader_type', sa.String(50), nullable=True, server_default='skeleton', comment='Loader type: skeleton or typing'))
    op.add_column('search_settings', sa.Column('search_background_color', sa.String(50), nullable=True, server_default='#d5d4d4', comment='Background color (hex)'))
    op.add_column('search_settings', sa.Column('search_text_color', sa.String(50), nullable=True, server_default='#000000', comment='Text color (hex)'))
    op.add_column('search_settings', sa.Column('search_border_radius', sa.String(50), nullable=True, server_default='semi-rounded', comment='Border radius: rounded, medium-rounded, semi-rounded, or square'))
    op.add_column('search_settings', sa.Column('search_result_style', sa.String(50), nullable=True, server_default='list', comment='Result style: list or other'))
    
    # Search Customization columns
    op.add_column('search_settings', sa.Column('search_form_type', sa.String(50), nullable=True, server_default='withBtn', comment='Form type: default or withBtn'))
    op.add_column('search_settings', sa.Column('search_button_type', sa.String(50), nullable=True, server_default='icon', comment='Button type: icon or withLabel'))
    op.add_column('search_settings', sa.Column('search_button_text', sa.String(100), nullable=True, server_default='Search', comment='Search button text'))
    op.add_column('search_settings', sa.Column('search_input_placeholder', sa.String(255), nullable=True, comment='Search input placeholder text'))
    op.add_column('search_settings', sa.Column('search_recent_search', sa.Boolean(), nullable=True, server_default='true', comment='Enable recent search history'))
    op.add_column('search_settings', sa.Column('search_recent_search_title', sa.String(255), nullable=True, comment='Recent search title'))
    op.add_column('search_settings', sa.Column('search_predefined_questions', sa.Boolean(), nullable=True, server_default='false', comment='Show predefined questions'))
    op.add_column('search_settings', sa.Column('search_questions_position', sa.String(50), nullable=True, server_default='below-search', comment='Questions position: below-search or other'))
    op.add_column('search_settings', sa.Column('search_questions_limit', sa.Integer(), nullable=True, server_default='5', comment='Number of questions to show'))
    op.add_column('search_settings', sa.Column('search_questions', postgresql.JSON, nullable=True, comment='List of predefined questions (JSON array)'))


def downgrade() -> None:
    # Remove Search Customization columns
    op.drop_column('search_settings', 'search_questions')
    op.drop_column('search_settings', 'search_questions_limit')
    op.drop_column('search_settings', 'search_questions_position')
    op.drop_column('search_settings', 'search_predefined_questions')
    op.drop_column('search_settings', 'search_recent_search_title')
    op.drop_column('search_settings', 'search_recent_search')
    op.drop_column('search_settings', 'search_input_placeholder')
    op.drop_column('search_settings', 'search_button_text')
    op.drop_column('search_settings', 'search_button_type')
    op.drop_column('search_settings', 'search_form_type')
    
    # Remove Search Configuration columns
    op.drop_column('search_settings', 'search_result_style')
    op.drop_column('search_settings', 'search_border_radius')
    op.drop_column('search_settings', 'search_text_color')
    op.drop_column('search_settings', 'search_background_color')
    op.drop_column('search_settings', 'search_loader_type')
    op.drop_column('search_settings', 'search_icon')
    op.drop_column('search_settings', 'search_box_layout')
    op.drop_column('search_settings', 'search_style_option')
    op.drop_column('search_settings', 'search_title')
