"""Tests for verified source URL enrichment in chat answers."""
from __future__ import annotations

from app.routes.rag import _finalize_chat_answer_for_user, _refine_answer
from app.services.chat_answer_links import (
    answer_contains_verified_url,
    append_missing_verified_source_links,
    enforce_answer_urls_from_sources,
    enrich_chat_answer_with_verified_links,
    move_source_links_to_bottom,
    rank_sources_for_user_query,
    resolve_preferred_page_url,
    should_inject_verified_links,
    source_url_line_for_context,
    strip_contradictory_no_link_denials,
    strip_answer_links_from_text,
    user_asks_geographic_location,
    user_seeks_resource_access,
)


def test_source_url_line_for_context_http():
    meta = {"url": "https://heh-bs.de/kliniken/orthopaedie", "title": "Orthopedics"}
    assert source_url_line_for_context(meta) == (
        "Source URL: https://heh-bs.de/kliniken/orthopaedie\n"
    )


def test_source_url_line_for_context_skips_non_http():
    assert source_url_line_for_context({"url": "file://doc.pdf"}) == ""
    assert source_url_line_for_context({}) == ""


def test_user_seeks_resource_access_german_clinic_question():
    q = "Wo finde ich die orthopädische Klinik? Gib mir den Link dazu"
    assert user_seeks_resource_access(q)


def test_user_seeks_resource_access_false_for_opening_hours():
    assert not user_seeks_resource_access("What are the opening hours?")


def test_geographic_location_not_treated_as_link_request():
    q = "where NITSAN located?"
    assert user_asks_geographic_location(q)
    assert not user_seeks_resource_access(q)
    assert not should_inject_verified_links(
        q,
        "NITSAN is in Bhavnagar.",
        [{"title": "GDPR", "url": "https://nitsantech.de/en/blog/what-is-the-gdpr"}],
    )


def test_enrich_strips_link_for_geographic_location_question():
    answer = (
        "NITSAN Technologies is headquartered in Ahmedabad, Gujarat, India.\n\n"
        "- **Link:** [What is the GDPR?](https://nitsantech.de/en/blog/what-is-the-gdpr)"
    )
    sources = [
        {"title": "What is the GDPR?", "url": "https://nitsantech.de/en/blog/what-is-the-gdpr"},
        {"title": "Shopware", "url": "https://nitsantech.de/en/blog/shopware"},
    ]
    out = enrich_chat_answer_with_verified_links(
        answer, sources, user_query="where NITSAN located?"
    )
    assert out is not None
    assert "Link:" not in out
    assert "gdpr" not in out.lower()
    assert "Ahmedabad" in out  # body text preserved; grounding is handled by prompt/retrieval


def test_append_skips_zero_relevance_source_even_when_seeking_access():
    answer = "Details are on the site."
    sources = [
        {"title": "What is the GDPR?", "url": "https://nitsantech.de/en/blog/what-is-the-gdpr"},
    ]
    out = append_missing_verified_source_links(
        answer, sources, user_query="Wo finde ich die orthopädische Klinik?"
    )
    assert out is not None
    assert "gdpr" not in out.lower()
    assert "Link:" not in out


def test_answer_contains_verified_url_specific_path_not_satisfied_by_homepage():
    url = "https://heh-bs.de/kliniken/orthopaedie"
    answer = "Visit the hospital main website: www.heh-bs.de and navigate to Kliniken."
    assert not answer_contains_verified_url(answer, url)


def test_answer_contains_verified_url_detects_markdown_and_plain():
    url = "https://heh-bs.de/kliniken/orthopaedie"
    assert answer_contains_verified_url(f"See [{url}]({url})", url)
    assert answer_contains_verified_url(f"Visit {url} for details.", url)
    assert not answer_contains_verified_url("No page given.", url)


def test_strip_contradictory_no_link_denials_heh_example():
    answer = (
        "Unfortunately, the documents do not include a direct link to the "
        "Orthopedic Clinic's webpage or specific contact details. "
        "Visit the hospital's main website: www.heh-bs.de and navigate to the "
        '"Kliniken" (Clinics) section.\n\n'
        "### Directions\nBy Tram: line 1."
    )
    out = strip_contradictory_no_link_denials(answer)
    assert "do not include a direct link" not in out.lower()
    assert "navigate to the" not in out.lower()
    assert "By Tram" in out


def test_append_injects_when_user_seeks_access():
    answer = "The orthopedic clinic is at Leipziger Straße 24."
    sources = [
        {
            "title": "Orthopedic Clinic",
            "url": "https://heh-bs.de/kliniken/orthopaedie",
        }
    ]
    q = "Wo finde ich die orthopädische Klinik?"
    out = append_missing_verified_source_links(answer, sources, user_query=q)
    assert out is not None
    assert "[Orthopedic Clinic](https://heh-bs.de/kliniken/orthopaedie)" in out


def test_append_skips_when_user_did_not_seek_access():
    answer = "The orthopedic clinic opens at 8am."
    sources = [{"title": "Clinic", "url": "https://heh-bs.de/kliniken/orthopaedie"}]
    out = append_missing_verified_source_links(answer, sources, user_query="Opening hours?")
    assert out == answer


def test_append_injects_when_answer_claims_no_link_even_without_access_query():
    answer = "Unfortunately, the documents do not include a direct link to the clinic page."
    sources = [{"title": "Clinic", "url": "https://heh-bs.de/kliniken/orthopaedie"}]
    out = append_missing_verified_source_links(answer, sources, user_query="Tell me about the clinic")
    assert out is not None
    assert "[Clinic](https://heh-bs.de/kliniken/orthopaedie)" in out


def test_append_skips_when_specific_url_already_present():
    url = "https://heh-bs.de/kliniken/orthopaedie"
    answer = f"Details at {url}."
    sources = [{"title": "Clinic", "url": url}]
    out = append_missing_verified_source_links(
        answer, sources, user_query="Wo finde ich die Klinik?"
    )
    assert out == answer


def test_user_seeks_resource_access_false_for_give_me_details_without_link():
    assert not user_seeks_resource_access("Give me details about the orthopedic clinic")


def test_enrich_strips_model_link_for_general_question():
    answer = (
        "Quality programs ensure patient safety.\n\n"
        "- **Link:** [Patient info](https://www.heh-bs.de/patienten-besucher/informationen-von-a-z)"
    )
    sources = [
        {
            "title": "Patienten A-Z",
            "url": "https://www.heh-bs.de/patienten-besucher/informationen-von-a-z",
        }
    ]
    out = enrich_chat_answer_with_verified_links(
        answer,
        sources,
        user_query="What is quality management?",
    )
    assert out is not None
    assert "](http" not in out
    assert "Quality programs" in out


def test_finalize_chat_strips_llm_link_for_general_question():
    answer = "Services include surgery.\n\n[Clinic page](https://heh-bs.de/clinic)"
    sources = [{"title": "HEH Clinic", "url": "https://heh-bs.de/clinic"}]
    out = _finalize_chat_answer_for_user(
        answer,
        sources,
        user_query="What services does the clinic offer?",
    )
    assert out is not None
    assert "](http" not in out
    assert "Services include surgery" in out


def test_strip_answer_links_from_text_removes_inline_and_bare_urls():
    answer = "See [HEH](https://heh-bs.de/foo) or visit https://heh-bs.de/bar for more."
    out = strip_answer_links_from_text(answer)
    assert "http" not in out.lower()
    assert "See HEH" in out


def test_enrich_heh_style_answer_with_homepage_only_in_text():
    answer = (
        "Unfortunately, the documents do not include a direct link to the "
        "Orthopedic Clinic's webpage. Visit www.heh-bs.de and navigate to Kliniken."
    )
    sources = [{"title": "Orthopedic Clinic", "url": "https://heh-bs.de/kliniken/orthopaedie"}]
    q = "Wo finde ich die orthopädische Klinik? Gib mir den Link"
    out = enrich_chat_answer_with_verified_links(answer, sources, user_query=q)
    assert out is not None
    assert "do not include a direct link" not in out.lower()
    assert "[Orthopedic Clinic](https://heh-bs.de/kliniken/orthopaedie)" in out


def test_finalize_chat_injects_when_user_seeks_access():
    answer = "The clinic is in Braunschweig."
    sources = [{"title": "HEH Clinic", "url": "https://heh-bs.de/clinic"}]
    out = _finalize_chat_answer_for_user(
        answer,
        sources,
        user_query="Where can I find the clinic?",
    )
    assert out is not None
    assert "[HEH Clinic](https://heh-bs.de/clinic)" in out


def test_finalize_chat_skips_injection_for_general_question():
    answer = "The clinic is in Braunschweig."
    sources = [{"title": "HEH Clinic", "url": "https://heh-bs.de/clinic"}]
    out = _finalize_chat_answer_for_user(
        answer,
        sources,
        user_query="What services does the clinic offer?",
    )
    assert out == answer


def test_should_inject_when_answer_denies_link():
    assert should_inject_verified_links(
        "About the clinic",
        "Documents do not include a direct link to the clinic.",
        [{"url": "https://example.com/clinic", "title": "Clinic"}],
    )


def test_strip_rag_boilerplate_openers():
    answer = (
        "Based on the provided documents, here is the direct information regarding "
        "the Orthopedic Clinic:\n\n### Clinic\nDetails here."
    )
    from app.services.chat_answer_links import strip_rag_boilerplate_openers

    out = strip_rag_boilerplate_openers(answer)
    assert "based on the provided documents" not in out.lower()
    assert "### Clinic" in out


def test_rank_sources_prefers_orthopedic_clinic_url():
    sources = [
        {"title": "General HEH", "url": "https://www.heh-bs.de/"},
        {
            "title": "Orthopedic Clinic",
            "url": "https://www.heh-bs.de/kliniken/orthopaedische-klinik",
        },
    ]
    q = "Wo finde ich die orthopädische Klinik? Gib mir den Link dazu"
    ranked = rank_sources_for_user_query(sources, q)
    assert "orthopaedische-klinik" in ranked[0]["url"]


def test_access_query_keeps_content_but_fixes_link():
    answer = (
        "For hip-related issues such as wear and tear, the Orthopedic Clinic at HEH "
        "is the appropriate department. You can find details here: "
        "[Orthopedic Clinic at HEH](https://www.heh-bs.de/wrong-page)"
    )
    sources = [
        {
            "title": "Orthopädische Klinik",
            "url": "https://www.heh-bs.de/kliniken/orthopaedische-klinik",
        }
    ]
    q = "Wo finde ich die orthopädische Klinik? Gib mir den Link dazu"
    out = enrich_chat_answer_with_verified_links(answer, sources, user_query=q)
    assert out is not None
    assert "hip-related" in out.lower()
    assert "orthopaedische-klinik" in out
    assert "wrong-page" not in out


def test_inject_single_link_with_title_from_url_when_metadata_junk():
    answer = "The clinic treats shoulder and spine conditions."
    sources = [
        {"title": "No Title", "url": "https://www.heh-bs.de/kliniken/orthopaedische-klinik"},
        {"title": "No Title", "url": "https://www.heh-bs.de/other-page"},
    ]
    q = "give me link"
    out = append_missing_verified_source_links(answer, sources, user_query=q)
    assert out is not None
    assert out.count("](http") == 1
    assert "No Title" not in out
    assert "Orthopaedische Klinik" in out or "orthopaedische-klinik" in out.lower()


def test_link_appended_when_user_seeks_access_and_no_link_in_answer():
    answer = "The clinic treats shoulder and spine conditions."
    sources = [{"title": "Orthopedic Clinic", "url": "https://heh-bs.de/kliniken/orthopaedie"}]
    q = "Wo finde ich die orthopädische Klinik? Gib mir den Link"
    out = append_missing_verified_source_links(answer, sources, user_query=q)
    assert out is not None
    assert "[Orthopedic Clinic](https://heh-bs.de/kliniken/orthopaedie)" in out
    assert out.count("](http") == 1
    assert "shoulder" in out.lower()


def test_no_duplicate_link_when_answer_already_has_source_url():
    url = "https://www.heh-bs.de/kliniken/orthopaedische-klinik"
    answer = (
        "Details about the clinic.\n\n"
        f"**Contact:**\n- Link: [Orthopädische Klinik]({url})"
    )
    sources = [{"title": "Orthopädische Klinik: Herzogin Elisabeth Hospital", "url": url}]
    q = "give me details about Orthopädische Klinik and give me link of it"
    out = enrich_chat_answer_with_verified_links(answer, sources, user_query=q)
    assert out is not None
    assert out.count("](http") == 1
    assert "Details about the clinic" in out


def test_resolve_preferred_page_url_picks_longest_heh_path():
    short = "https://www.heh-bs.de/kliniken/medizinische-klinik"
    long = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/kliniken/medizinische-klinik"
    out = resolve_preferred_page_url(short, [short, long])
    assert out == long


def test_refine_answer_preserves_inline_markdown_link():
    raw = "Visit [HEH website](https://heh-bs.de/) for more."
    out = _refine_answer(raw)
    assert "[HEH website](https://heh-bs.de/)" in out


def test_refine_answer_strips_inline_source_markers():
    raw = (
        "Rating: 5/5 **(Source 4)**\n"
        "- Ahmedabad is a World Heritage City (Sources 1, 2, 4).\n"
        "- Modhera Sun Temple (Source 1).\n"
        "See [guide](https://example.com/a) for details."
    )
    out = _refine_answer(raw)
    assert "Source" not in out
    assert "Sources" not in out
    assert "5/5" in out
    assert "World Heritage City" in out
    assert "[guide](https://example.com/a)" in out


def test_move_source_links_to_bottom():
    answer = (
        "Overview paragraph about patient information.\n\n"
        "- **Source URL:** [Information from A-Z](https://www.heh-bs.de/patienten)\n\n"
        "### Visiting Guidelines\n"
        "- Max two visitors per patient."
    )
    out = move_source_links_to_bottom(answer)
    assert out is not None
    assert out.strip().endswith("(https://www.heh-bs.de/patienten)")
    assert out.index("Overview paragraph") < out.index("Link:")
    assert out.index("Visiting Guidelines") < out.index("Link:")
    assert out.count("](http") == 1


def test_consolidate_multiple_bottom_links_to_one():
    sources = [
        {"title": "Patient Portal", "url": "https://www.patientenportal.heh-bs.de/"},
        {
            "title": "Patienten & Besucher Übersicht (A-Z)",
            "url": "https://www.heh-bs.de/patienten-besucher/informationen-von-a-z",
        },
    ]
    answer = (
        "Quality overview text.\n\n"
        "www.patientenportal.heh-bs.de\n"
        "[Patienten & Besucher Übersicht (A-Z)](https://www.heh-bs.de/patienten-besucher/informationen-von-a-z)\n"
        "[No Title](https://www.heh-bs.de/page-a)\n"
    )
    out = move_source_links_to_bottom(answer, sources=sources)
    assert out is not None
    assert out.count("](http") == 1
    assert "patientenportal" not in out.lower()
    assert "patienten-besucher/informationen-von-a-z" in out
    assert "Quality overview text" in out


def test_portal_link_replaced_by_main_site_source():
    sources = [
        {"title": "Patient Portal", "url": "https://www.patientenportal.heh-bs.de/"},
        {
            "title": "Patienten A-Z",
            "url": "https://www.heh-bs.de/patienten-besucher/informationen-von-a-z",
        },
    ]
    answer = "Quality programs are described here.\n\nhttps://www.patientenportal.heh-bs.de/"
    q = "give me link of this info"
    out = enrich_chat_answer_with_verified_links(answer, sources, user_query=q)
    assert out is not None
    assert "patientenportal" not in out.lower()
    assert "patienten-besucher/informationen-von-a-z" in out


def test_enforce_answer_urls_from_sources_replaces_unknown_domain_link():
    answer = "Open this: https://heh.de/kliniken-zentren-einrichtungen"
    sources = [
        {
            "title": "Gefaesschirurgische Klinik",
            "url": "https://www.heh-bs.de/kliniken-zentren-einrichtungen/kliniken/gefaesschirurgische-klinik",
        }
    ]
    out = enforce_answer_urls_from_sources(answer, sources, user_query="Gib mir den Link")
    assert out is not None
    assert "https://heh.de/kliniken-zentren-einrichtungen" not in out
    assert "https://www.heh-bs.de/kliniken-zentren-einrichtungen/kliniken/gefaesschirurgische-klinik" in out


def test_enforce_replaces_wrong_link_with_most_specific_source():
    generic = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/"
    specific = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/kliniken/orthopaedische-klinik"
    answer = f"- Link: [Patient info]({generic})"
    sources = [
        {"title": "Kliniken listing", "url": generic},
        {"title": "Orthopädische Klinik", "url": specific},
    ]
    out = enforce_answer_urls_from_sources(answer, sources)
    assert out is not None
    assert specific in out
    assert "kliniken-zentren-einrichtungen/" not in out.replace(specific, "")


def test_enforce_answer_urls_from_sources_keeps_source_url():
    url = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/kliniken/gefaesschirurgische-klinik"
    answer = f"Open this: {url}"
    sources = [{"title": "Gefaesschirurgische Klinik", "url": url}]
    out = enforce_answer_urls_from_sources(answer, sources, user_query="Gib mir den Link")
    assert out == answer
