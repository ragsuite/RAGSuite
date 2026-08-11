from app.services.pdf_text_cleaner import normalize_pdf_extracted_text


def test_normalize_pdf_extracted_text_keeps_normal_text():
    text = (
        "All studies are done with modern devices in hospitals and clinics. "
        "This sentence should remain unchanged."
    )
    assert normalize_pdf_extracted_text(text) == text


def test_normalize_pdf_extracted_text_keeps_normal_german_short_words():
    text = "In der Stadt gibt es viele Ärzte und Patienten mit modernen Geräten."
    assert normalize_pdf_extracted_text(text) == text


def test_normalize_pdf_extracted_text_fixes_spaced_words_when_pattern_is_strong():
    text = (
        "M i t l e r w e i l e ist der zweite E u r o p ä i s c h e n Bericht. "
        "A l l e Untersuchungen mit modernen G e r ä t e n wurden durchgeführt."
    )
    cleaned = normalize_pdf_extracted_text(text)
    assert "M i t l e r w e i l e" not in cleaned
    assert "E u r o p ä i s c h e n" not in cleaned
    assert "G e r ä t e n" not in cleaned
    assert "Mitlerweile" in cleaned
    assert "Europäischen" in cleaned
    assert "Geräten" in cleaned


def test_normalize_pdf_extracted_text_fixes_fragmented_german_pdf_pattern():
    text = (
        "M ittlerw eile ist jed er zw eite Eu ro p äer zw isch en 25 u nd 30 J ah ren. "
        "U n tersu ch u n g sm eth od en können mit den m od ern sten G eräten durchgeführt. "
        "kön - n en mit den modernsten Geräten in der K lin ik werden."
    )
    cleaned = normalize_pdf_extracted_text(text)
    assert "M ittlerw eile" not in cleaned
    assert "jed er" not in cleaned
    assert "Eu ro p äer" not in cleaned
    assert "Mittlerweile" in cleaned
    assert "jeder" in cleaned
    assert "Europäer" in cleaned
    assert "Untersu ch u n g" not in cleaned
    assert "chungsmeth" in cleaned
    assert "können" in cleaned
    assert "in der" in cleaned


def test_normalize_pdf_extracted_text_does_not_change_single_short_artifact():
    text = "Roadmap draft: E u r o p a initiative starts next month."
    assert normalize_pdf_extracted_text(text) == text
