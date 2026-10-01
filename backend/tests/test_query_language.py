"""Dependency-free question/chunk language detection."""
import pytest

from app.services.rag.query_language import detect_text_language, normalize_lang_code


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Welche Produkte bietet Mohn an?", "de"),
        ("Wo ist der Hauptsitz von Mohn?", "de"),
        ("Edelstahlbehälter für Lebensmittel", "de"),
        ("What products does Mohn offer?", "en"),
        ("Where is Mohn located?", "en"),
        ("Quels produits propose Mohn ?", "fr"),
        ("¿Qué productos ofrece Mohn?", "es"),
        ("Quais produtos a Mohn oferece?", "pt"),
        ("Quali prodotti offre Mohn?", "it"),
        ("Welke producten biedt Mohn aan?", "nl"),
        ("ما هي منتجات موهن؟", "ar"),
        ("मोहन क्या उत्पाद देता है?", "hi"),
        ("Mohn 提供哪些产品？", "zh"),
        ("モーンの製品は何ですか", "ja"),
        ("Какие продукты предлагает Mohn?", "ru"),
    ],
)
def test_detects_question_language(text, expected):
    assert detect_text_language(text) == expected


@pytest.mark.parametrize("text", ["", "Mohn", "T3Planet", "in stock", "Hand cleaning station", None])
def test_weak_evidence_is_unknown(text):
    assert detect_text_language(text) is None


def test_detects_long_chunk_text():
    german = "Die Hygieneschleuse ist mit einer Sohlenreinigung und einer Handdesinfektion ausgestattet. " * 3
    english = "The hygiene station is equipped with sole cleaning and hand disinfection for the staff. " * 3
    assert detect_text_language(german) == "de"
    assert detect_text_language(english) == "en"


@pytest.mark.parametrize(
    "code, expected",
    [("de-DE", "de"), ("en_GB", "en"), ("ZH-hans", "zh"), ("pt", "pt"), ("", None), (None, None), ("12", None)],
)
def test_normalize_lang_code(code, expected):
    assert normalize_lang_code(code) == expected
