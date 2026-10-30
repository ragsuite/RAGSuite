"""AUTO headless upgrade gate and Domain sitemap seed merge helpers."""
from __future__ import annotations

from app.services import crawler


SHELL_HTML = """
<html><body>
  <header>""" + (
    "Sugar Cosmetics makeup beauty shop free shipping worldwide offer. " * 4
) + """</header>
  <div id="app">Loading the catalog experience for you.</div>
  <a href="/">Home</a>
  <a href="https://cdn.example.net/x">CDN</a>
</body></html>
"""

RICH_HTML = """
<html><body>
  <nav>
    <a href="/lips">Lips</a>
    <a href="/eyes">Eyes</a>
    <a href="/face">Face</a>
    <a href="/nails">Nails</a>
    <a href="/skincare">Skincare</a>
    <a href="/kits">Kits</a>
    <a href="/offers">Offers</a>
    <a href="/blog">Blog</a>
    <a href="/about">About</a>
  </nav>
  <main>""" + ("Product catalog text. " * 20) + """</main>
</body></html>
"""


def test_quick_same_domain_link_count_ignores_external_and_fragments():
    html = """
    <a href="/a">A</a>
    <a href="/a#top">A again</a>
    <a href="https://www.example.com/b">B</a>
    <a href="https://other.test/c">C</a>
    <a href="mailto:x@example.com">mail</a>
    <a href="#section">frag</a>
    """
    assert crawler._quick_same_domain_link_count(html, "https://example.com/") == 2


def test_shell_html_has_enough_text_but_sparse_links():
    text_len = crawler._quick_visible_text_length(SHELL_HTML)
    links = crawler._quick_same_domain_link_count(SHELL_HTML, "https://www.sugarcosmetics.com/")
    assert text_len >= 120
    assert links < 8
    assert crawler.should_upgrade_auto_headless(text_len, links) is True


def test_rich_html_skips_playwright_when_text_and_links_ok():
    text_len = crawler._quick_visible_text_length(RICH_HTML)
    links = crawler._quick_same_domain_link_count(RICH_HTML, "https://example.com/")
    assert text_len >= 120
    assert links >= 8
    assert crawler.should_upgrade_auto_headless(text_len, links) is False


def test_should_upgrade_when_text_short_even_with_many_links():
    assert crawler.should_upgrade_auto_headless(10, 50, min_text_chars=120, min_same_domain_links=8)


def test_auto_upgrade_skipped_when_http_not_ok():
    assert crawler.should_upgrade_auto_headless(10, 0, http_ok=False) is False


def test_sitemap_seeded_auto_ignores_sparse_links_when_text_ok():
    text_len = crawler._quick_visible_text_length(SHELL_HTML)
    links = crawler._quick_same_domain_link_count(SHELL_HTML, "https://www.sugarcosmetics.com/")
    assert text_len >= 120
    assert links < 8
    assert crawler.should_upgrade_auto_headless(
        text_len, links, sitemap_seeded=True
    ) is False


def test_should_requeue_throttle_and_empty_not_404():
    assert crawler.should_requeue_url(status=429, attempt=1) is True
    assert crawler.should_requeue_url(status=503, attempt=2) is True
    assert crawler.should_requeue_url(status=None, attempt=1) is True
    assert crawler.should_requeue_url(status=404, attempt=1) is False
    assert crawler.should_requeue_url(status=429, attempt=3) is True
    assert crawler.should_requeue_url(status=429, attempt=50) is False


def test_idle_keeps_queued_urls_and_cancels_hung_tasks():
    assert crawler.idle_crawl_action(queued=10, active=0, idle_seconds=10) == "ok"
    assert crawler.idle_crawl_action(queued=400, active=0, idle_seconds=301) == "continue"
    assert crawler.idle_crawl_action(queued=400, active=3, idle_seconds=301) == "cancel_hung"
    assert crawler.idle_crawl_action(queued=0, active=2, idle_seconds=301) == "cancel_hung"
    assert crawler.idle_crawl_action(queued=0, active=0, idle_seconds=301) == "ok"


def test_merge_domain_sitemap_seeds_dedupes_and_caps():
    merged = crawler.merge_domain_sitemap_seeds(
        "https://example.com",
        [
            "https://example.com",
            "https://example.com/a",
            "https://example.com/b",
            "https://example.com/c",
        ],
        max_pages=3,
    )
    assert merged == [
        "https://example.com",
        "https://example.com/a",
        "https://example.com/b",
    ]


def test_domain_sitemap_probe_url():
    assert (
        crawler._domain_sitemap_probe_url("https://www.sugarcosmetics.com/")
        == "https://www.sugarcosmetics.com/sitemap.xml"
    )
    assert crawler._domain_sitemap_probe_url("not-a-url") is None
