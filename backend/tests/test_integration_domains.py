"""Tests for per-project allowed domains helpers."""

from __future__ import annotations

from uuid import uuid4

from app.services.integration_domains import (
    append_domains_for_project,
    ensure_domains_by_project,
    get_domains_for_project,
    get_project_domain_lists,
    set_domains_for_project,
)


def test_migration_copies_flat_lists_to_all_owned_projects():
    project_a = uuid4()
    project_b = uuid4()
    keys = {
        "keys": [{"id": "k1"}],
        "chatbot_domains": ["https://a.example"],
        "search_domains": ["https://b.example"],
    }

    migrated = ensure_domains_by_project(keys, owned_project_ids=[project_a, project_b])

    assert "by_project" in migrated
    assert migrated["chatbot_domains"] == ["https://a.example"]  # flat preserved
    assert migrated["search_domains"] == ["https://b.example"]
    assert get_domains_for_project(migrated, project_a, "chatbot") == ["https://a.example"]
    assert get_domains_for_project(migrated, project_b, "search") == ["https://b.example"]
    # Idempotent
    again = ensure_domains_by_project(migrated, owned_project_ids=[project_a, project_b])
    assert again["by_project"][str(project_a)]["chatbot_domains"] == ["https://a.example"]


def test_write_to_project_a_does_not_change_project_b():
    project_a = uuid4()
    project_b = uuid4()
    keys = ensure_domains_by_project(
        {
            "chatbot_domains": ["https://shared.example"],
            "search_domains": ["https://shared.example"],
        },
        owned_project_ids=[project_a, project_b],
    )

    updated = set_domains_for_project(
        keys,
        project_a,
        chatbot_domains=["https://only-a.example"],
        search_domains=["https://only-a.example"],
    )

    chatbot_a, search_a = get_project_domain_lists(updated, project_a)
    chatbot_b, search_b = get_project_domain_lists(updated, project_b)
    assert chatbot_a == ["https://only-a.example"]
    assert search_a == ["https://only-a.example"]
    assert chatbot_b == ["https://shared.example"]
    assert search_b == ["https://shared.example"]


def test_new_project_bucket_starts_empty_after_migration():
    project_a = uuid4()
    project_new = uuid4()
    keys = ensure_domains_by_project(
        {"chatbot_domains": ["https://old.example"], "search_domains": []},
        owned_project_ids=[project_a],
    )
    # After migration, a project not in by_project must not inherit flat lists.
    assert get_domains_for_project(keys, project_new, "chatbot") == []
    assert get_domains_for_project(keys, project_new, "search") == []


def test_pre_migration_fallback_uses_flat_lists():
    project_a = uuid4()
    keys = {
        "chatbot_domains": ["https://legacy-chat.example"],
        "search_domains": ["https://legacy-search.example"],
    }
    assert get_domains_for_project(keys, project_a, "chatbot") == [
        "https://legacy-chat.example"
    ]
    assert get_domains_for_project(keys, project_a, "search") == [
        "https://legacy-search.example"
    ]
    assert get_domains_for_project(keys, project_a, "both") == [
        "https://legacy-chat.example",
        "https://legacy-search.example",
    ]


def test_append_domains_for_project_isolation():
    project_a = uuid4()
    project_b = uuid4()
    keys = ensure_domains_by_project(
        {"chatbot_domains": [], "search_domains": []},
        owned_project_ids=[project_a, project_b],
    )
    keys, added_chat, added_search = append_domains_for_project(
        keys,
        project_a,
        ["https://crawl.example"],
        to_chatbot=True,
        to_search=True,
    )
    assert added_chat == ["https://crawl.example"]
    assert added_search == ["https://crawl.example"]
    assert get_domains_for_project(keys, project_a, "both") == ["https://crawl.example"]
    assert get_domains_for_project(keys, project_b, "both") == []
