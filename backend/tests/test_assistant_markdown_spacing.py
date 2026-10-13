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


def test_heading_on_its_own_line_is_not_split():
    answer = (
        "Here's a comparison of the **ASUS ExpertBook P1** and **ASUS TUF Gaming A15**:\n"
        "### **ASUS ExpertBook P1 (Intel-based)**\n"
        "- **Processors**: Intel Core i3"
    )
    out = normalize_assistant_markdown_spacing(answer)
    assert "\n\n### **ASUS ExpertBook P1 (Intel-based)**\n" in out
    assert "\n#\n" not in out


def test_previously_split_heading_is_rejoined():
    stored = "Intro text:\n#\n\n## **Key Features**\n- Fast"
    out = normalize_assistant_markdown_spacing(stored)
    assert out == "Intro text:\n\n### **Key Features**\n- Fast"


def test_dash_inside_a_bold_item_name_is_not_a_bullet():
    text = "- **SUGAR Cosmetics Nourishing Lip Balm - Set of 2** — ₹298 - in stock"
    assert normalize_assistant_markdown_spacing(text) == (
        "- **SUGAR Cosmetics Nourishing Lip Balm - Set of 2** — ₹298\n- in stock"
    )


def test_csharp_is_not_a_heading():
    text = "Use C# is fine and F# too."
    assert normalize_assistant_markdown_spacing(text) == text


def test_comments_inside_code_fences_are_untouched():
    text = "Run this:\n\n```bash\npip install x  # deps\n# start\nragsuite run\n```"
    assert normalize_assistant_markdown_spacing(text) == text
