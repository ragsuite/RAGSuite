"""Crawler page text: block separation, table rows, UI noise removal, link safety."""
from bs4 import BeautifulSoup

from app.services.html_page_text import extract_page_text, html_to_page_text

PRODUCT_PAGE = """
<html><body>
<ul class="breadcrumb"><li><a href="/">Startseite</a></li><li><a href="/p">Produkte</a></li></ul>
<div class="owl-carousel">
  <div><span class="product_caption">Sole-Master "Highline" Dry, Art.-Nr. 10.00.00.36 mit Standgestell</span></div>
  <div><span class="product_caption">Sole-Master "Highline" Dry, Art.-Nr. 10.00.00.36 mit Standgestell</span></div>
</div>
<form id="prodartikelform"><table>
  <tr><th>Typ</th><th>Ausführung</th><th>Artikel-Nr.</th></tr>
  <tr><td>Sole-Master Dry</td><td>Trocken</td>
      <td><span class="d-none">10.00.00.36</span><label><input type="checkbox">10.00.00.36</label></td></tr>
</table></form>
<div class="tab-pane"><p>Die Sole-Master-Dry wurde speziell für Lebensmittelbetriebe (Bäckereien)
entwickelt.</p><h3>Technische Daten</h3><p>Leistung 0,2 kW</p></div>
<div id="articleNotice" class="dialog mfp-hide"><h2>Kein Produkt im Anfragekorb!</h2>
<p>Bitte wählen Sie den gewünschten Artikel.</p></div>
<form id="datasheetForm"><h2>PDF per E-Mail</h2><input type="email" name="to">
<label>Datenschutzerklärung gelesen</label><a href="/datenschutz">Datenschutz</a></form>
<script>var x = "tracking";</script>
</body></html>
"""


def _text(html: str = PRODUCT_PAGE) -> str:
    return html_to_page_text(html)


def test_blocks_become_separate_lines():
    lines = _text().split("\n")
    assert "Startseite" in lines and "Produkte" in lines
    assert "Technische Daten" in lines
    assert "Leistung 0,2 kW" in lines


def test_table_rows_keep_cells_apart_and_dedupe_inside_cells():
    assert "Typ | Ausführung | Artikel-Nr." in _text()
    assert "Sole-Master Dry | Trocken | 10.00.00.36" in _text()


def test_product_form_with_table_is_kept_but_data_entry_form_dropped():
    text = _text()
    assert "10.00.00.36" in text
    assert "PDF per E-Mail" not in text and "Datenschutzerklärung" not in text


def test_ui_dialogs_scripts_and_repeated_captions_removed():
    text = _text()
    assert "Kein Produkt im Anfragekorb" not in text
    assert "tracking" not in text
    assert text.count('Sole-Master "Highline" Dry, Art.-Nr. 10.00.00.36 mit Standgestell') == 1


def test_sentences_survive_intact():
    assert "Die Sole-Master-Dry wurde speziell für Lebensmittelbetriebe (Bäckereien) entwickelt." in _text()


def test_long_modal_content_is_kept():
    bio = "Lebenslauf " * 120
    html = f'<body><div class="modal"><button>×</button><p>{bio}</p></div></body>'
    assert "Lebenslauf" in _text(html)


def test_page_wrapping_form_is_not_dropped():
    article = "Inhalt " * 400
    html = f'<body><form id="aspnetForm"><input type="text" name="q"><h1>Titel</h1><p>{article}</p></form></body>'
    assert "Titel" in _text(html)


def test_inline_formatting_does_not_split_words_but_layout_spans_do():
    assert _text("<p>m<sup>2</sup> und <b>Sohlen</b>reinigung</p>") == "m2 und Sohlenreinigung"
    assert _text("<div><span>Sole-Master</span><span>Dry</span></div>") == "Sole-Master Dry"
    assert _text("<p>siehe <a href='/x'>hier</a>.</p>") == "siehe hier."


def test_source_soup_is_not_modified():
    soup = BeautifulSoup(PRODUCT_PAGE, "html.parser")
    links_before = len(soup.find_all("a", href=True))
    extract_page_text(soup.body)
    assert len(soup.find_all("a", href=True)) == links_before
    assert soup.find(id="articleNotice") is not None


def test_hidden_until_found_kept_and_hidden_removed():
    html = '<body><div hidden>versteckt</div><div hidden="until-found">Akkordeon Inhalt</div></body>'
    text = _text(html)
    assert "versteckt" not in text and "Akkordeon Inhalt" in text


def test_empty_input():
    assert extract_page_text(None) == ""
    assert html_to_page_text("") == ""
