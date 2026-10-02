"""Language-aware keyword extraction, light stems and compound parts."""
from app.services.rag import query_keywords as qk
from app.services.rag.rag import Retriever

BAKERY_QUESTION = (
    "Wir sind eine Bäckerei und dürfen kein Wasser in den Produktionsbereich verschleppen. "
    "Welche Sohlenreinigung brauchen wir, und wie lautet die Artikelnummer?"
)


def test_german_question_keeps_topic_words_not_filler():
    kw = qk.extract_keywords(BAKERY_QUESTION)
    assert kw == ["bäckerei", "wasser", "produktionsbereich", "verschleppen", "sohlenreinigung", "artikelnummer"]


def test_retriever_delegates_and_detects_language():
    assert Retriever._extract_keywords(BAKERY_QUESTION) == qk.extract_keywords(BAKERY_QUESTION)
    assert qk.keyword_language(BAKERY_QUESTION) == "de"


def test_article_numbers_stay_one_token():
    kw = qk.extract_keywords("Was kostet Art.-Nr. 10.00.00.36 aus Edelstahl 1.4301?")
    assert "10.00.00.36" in kw and "1.4301" in kw
    assert "00" not in kw and "36" not in kw


def test_short_codes_with_digits_survive_min_length():
    assert "a4" in qk.extract_keywords("Gibt es das Datenblatt als A4 PDF?")


def test_english_behaviour_unchanged_for_plain_questions():
    assert qk.extract_keywords("what is the refund policy for orders") == ["refund", "policy", "orders"]
    assert qk.extract_keywords("do we have AI tools") == ["tools"]


def test_language_hint_used_when_question_is_ambiguous():
    assert qk.keyword_language("Sole-Master Dry", "de") == "de"
    assert qk.keyword_language("Sole-Master Dry") is None


def test_cap_keeps_most_informative_terms_in_question_order():
    words = ["alpha", "beta", "gamma", "delta", "kappa", "omega", "sigma", "theta", "lambda", "epsilon"]
    query = " ".join(words + ["10.00.00.36", "spezialreiniger"])
    kw = qk.extract_keywords(query)
    assert len(kw) == qk.MAX_KEYWORDS
    assert "10.00.00.36" in kw and "spezialreiniger" in kw
    assert kw == [w for w in query.split() if w in kw]


def test_match_form_is_always_a_prefix():
    for word, lang in [("verschleppen", "de"), ("sohlenreinigung", "de"), ("orders", "en"), ("prix", "fr")]:
        form = qk.match_form(word, lang)
        assert word.startswith(form) and len(form) >= 4
    assert qk.match_form("verschleppen", "de") == "verschlepp"
    assert qk.match_form("10.00.00.36", "de") == "10.00.00.36"
    assert qk.match_form("verschleppen", None) == "verschleppen"


def test_compound_tails_skip_short_words_and_codes():
    assert "verschleppung" in qk.compound_tails("wasserverschleppung")
    assert qk.compound_tails("wasser") == []
    assert qk.compound_tails("10.00.00.36") == []


def test_index_fragments_expose_compound_tails():
    text = "Die Sole-Master-Dry wurde für Bäckereien entwickelt, in denen keine Wasserverschleppung stattfinden darf."
    tails = qk.index_fragments(text, "de").split()
    assert "verschleppung" in tails
    assert qk.index_fragments(text, "en") == ""


def test_tsquery_text_stems_prefixes_and_keeps_codes():
    query = qk.tsquery_text(["verschleppen", "10.00.00.36", "ai"], "de")
    assert query == "verschlepp:* | 10.00.00.36:* | ai"
    assert qk.tsquery_text(["", "!"], "de") == ""
