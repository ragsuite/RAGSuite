"""Unit tests for assistant markdown spacing normalization."""

from __future__ import annotations

from app.services.assistant_markdown_spacing import normalize_assistant_markdown_spacing


def test_jammed_lists_and_fences_expand():
    jammed = (
        "**Steps:** - Contact sales for an EE license "
        "- Place the license file, then use: "
        "```bash ragsuite activate --license ./license.json ```"
    )
    out = normalize_assistant_markdown_spacing(jammed)
    assert out is not None
    assert "**Steps:**\n\n- Contact sales" in out
    assert "\n- Place the license" in out
    assert "```bash\nragsuite activate" in out
    assert out.rstrip().endswith("```")
    assert out.count("\n") >= 3


def test_well_formed_markdown_unchanged():
    well = "\n".join(
        [
            "**Steps:**",
            "",
            "- Contact sales for an EE license",
            "- Place the license file, then use:",
            "",
            "```bash",
            "ragsuite activate --license ./license.json",
            "```",
        ]
    )
    assert normalize_assistant_markdown_spacing(well) == well


def test_none_and_empty_safe():
    assert normalize_assistant_markdown_spacing(None) is None
    assert normalize_assistant_markdown_spacing("") == ""
    assert normalize_assistant_markdown_spacing("   ") == "   "


def test_jammed_ordered_list():
    out = normalize_assistant_markdown_spacing("Do this: 1. First step 2. Second step")
    assert out is not None
    assert "\n1. First step" in out
    assert "\n2. Second step" in out


def test_jammed_atx_headers_and_bullets():
    jammed = (
        "### Key Differences Between CE and EE #### 1. Licensing & Cost "
        "- Community Edition (CE) - Free. #### 2. Features - SSO on EE."
    )
    out = normalize_assistant_markdown_spacing(jammed)
    assert out is not None
    assert out.startswith("### Key Differences")
    assert "\n\n#### 1. Licensing" in out
    assert "\n\n#### 2. Features" in out
    assert "\n- Community Edition (CE)" in out
    assert "\n- Free." in out
    assert "\n- SSO on EE." in out
    assert "EE #### 1" not in out
    assert "Cost - Community" not in out
