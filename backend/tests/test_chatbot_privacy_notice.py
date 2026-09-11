"""Unit tests for chatbot privacy notice helpers."""
from app.services.chatbot_privacy_notice import (
    normalize_link_phrases,
    normalize_privacy_notice_payload,
    normalize_privacy_url,
    privacy_notice_from_row,
    validate_privacy_notice_for_enable,
)


def test_normalize_privacy_url_requires_http():
    assert normalize_privacy_url("https://example.com/privacy") == "https://example.com/privacy"
    assert normalize_privacy_url("http://example.com/p") == "http://example.com/p"
    assert normalize_privacy_url("ftp://example.com") is None
    assert normalize_privacy_url("not-a-url") is None
    assert normalize_privacy_url("") is None


def test_normalize_link_phrases_must_be_substrings():
    content = "See our privacy policy for details."
    assert normalize_link_phrases(["privacy policy", "missing"], content) == ["privacy policy"]
    assert normalize_link_phrases(["privacy policy", "privacy policy"], content) == ["privacy policy"]
    assert len(normalize_link_phrases(["a", "b", "c", "d", "e", "f"], "a b c d e f")) == 5


def test_version_bumps_only_when_prior_material_changes():
    first = normalize_privacy_notice_payload(
        {"content": "Hello privacy policy", "url": "https://example.com/p", "linkPhrases": ["privacy"]},
        enabled=True,
        previous={"enabled": False, "content": "", "url": None, "linkPhrases": [], "underlineLinks": True, "version": 1},
    )
    assert first["version"] == 1

    second = normalize_privacy_notice_payload(
        {"content": "Hello privacy policy updated", "url": "https://example.com/p", "linkPhrases": ["privacy"]},
        enabled=True,
        previous=first,
    )
    assert second["version"] == 2


def test_validate_requires_content_and_url_when_enabled():
    assert validate_privacy_notice_for_enable({"enabled": False, "content": "", "url": None}) is None
    assert validate_privacy_notice_for_enable({"enabled": True, "content": "", "url": "https://x.com"}) is not None
    assert validate_privacy_notice_for_enable({"enabled": True, "content": "Hi", "url": None}) is not None
    assert validate_privacy_notice_for_enable(
        {"enabled": True, "content": "Hi", "url": "https://x.com", "linkPhrases": []}
    ) is None


def test_privacy_notice_from_row_defaults():
    assert privacy_notice_from_row(None)["enabled"] is False
    assert privacy_notice_from_row(None)["underlineLinks"] is False


def test_underline_defaults_off_when_unset():
    out = normalize_privacy_notice_payload({"content": "Hi", "url": "https://example.com/p"}, enabled=True)
    assert out["underlineLinks"] is False
    out_on = normalize_privacy_notice_payload(
        {"content": "Hi", "url": "https://example.com/p", "underlineLinks": True},
        enabled=True,
    )
    assert out_on["underlineLinks"] is True


class _Row:
    privacy_notice_enabled = True
    privacy_notice = {
        "content": "Read privacy policy",
        "url": "https://example.com/privacy",
        "linkPhrases": ["privacy policy"],
        "underlineLinks": False,
        "version": 3,
    }


def test_privacy_notice_from_row_reads_stored_version():
    out = privacy_notice_from_row(_Row())
    assert out["enabled"] is True
    assert out["version"] == 3
    assert out["underlineLinks"] is False
    assert out["linkPhrases"] == ["privacy policy"]
