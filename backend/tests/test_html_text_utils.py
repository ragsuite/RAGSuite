"""Tests for mailto/tel enrichment in HTML text extraction."""
from bs4 import BeautifulSoup

from app.services.html_text_utils import enrich_contact_links


def _text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    enrich_contact_links(soup)
    return " ".join(soup.get_text().split())


def test_mailto_generic_label_replaced_with_email():
    html = '<a href="mailto:sekretariat-heller@heh-bs.de">E-Mail senden</a>'
    assert _text(html) == "sekretariat-heller@heh-bs.de"


def test_mailto_keeps_descriptive_label_with_email():
    html = '<a href="mailto:info@heh-bs.de">Kontakt aufnehmen</a>'
    assert _text(html) == "Kontakt aufnehmen (info@heh-bs.de)"


def test_mailto_already_contains_email_unchanged():
    html = '<a href="mailto:info@heh-bs.de">info@heh-bs.de</a>'
    assert _text(html) == "info@heh-bs.de"


def test_tel_generic_label_replaced_with_number():
    html = '<a href="tel:+495316992001">Anrufen</a>'
    assert "+495316992001" in _text(html)
