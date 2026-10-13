from bs4 import BeautifulSoup

from app.services import crawl_url_policy as policy
from app.services.crawler import _validate_crawl_url

BASE = "https://www.shop.example/"


def _link(html: str):
    return BeautifulSoup(html, "html.parser").find(["a", "link", "area"])


def test_fragment_and_tracking_params_are_dropped():
    url = "https://www.shop.example/products/kajal?pr_prod_strat=similar&pr_rec_id=1&utm_source=x&variant=42#reviews"
    assert policy.normalize_discovered_url(url) == "https://www.shop.example/products/kajal?variant=42"


def test_content_query_params_are_kept():
    url = "https://www.shop.example/search?q=kajal&page=2"
    assert policy.normalize_discovered_url(url) == url


def test_non_http_urls_are_left_alone():
    assert policy.normalize_discovered_url("mailto:hello@shop.example") == "mailto:hello@shop.example"


def test_machine_endpoints_are_not_content():
    for url in (
        "https://www.shop.example/products/kajal.oembed",
        "https://www.shop.example/collections/primer.atom",
        "https://www.shop.example/.well-known/ucp",
        "https://www.shop.example/cdn-cgi/l/email-protection",
    ):
        assert policy.non_content_reason(url) == "machine_endpoint", url


def test_shop_flows_are_not_content():
    for url in (
        "https://www.shop.example/cart",
        "https://www.shop.example/cart/4209:1?ucp/version=2026",
        "https://www.shop.example/cart/change?id=1&quantity=0",
        "https://www.shop.example/checkouts/abc",
        "https://www.shop.example/en/cart",
        "https://www.shop.example/account",
        "https://www.shop.example/account/login",
        "https://www.shop.example/login",
    ):
        assert policy.non_content_reason(url) == "transactional_path", url


def test_content_pages_stay_crawlable():
    for url in (
        "https://www.shop.example/pages/faqs",
        "https://www.shop.example/pages/returns-refunds",
        "https://www.shop.example/products/cart-organiser",
        "https://www.shop.example/extensions/cart",
        "https://docs.example/account/billing-settings",
        "https://www.shop.example/de/",
        "https://www.shop.example/",
    ):
        assert policy.non_content_reason(url) is None, url


def test_link_tags_follow_only_html_pages():
    assert policy.is_page_link_tag(_link('<a href="/pages/faqs">FAQ</a>'))
    assert policy.is_page_link_tag(_link('<link rel="alternate" hreflang="de" href="/de/">'))
    assert policy.is_page_link_tag(_link('<link rel="next" href="?page=2">'))
    assert not policy.is_page_link_tag(
        _link('<link rel="alternate" type="application/json+oembed" href="/p.oembed">')
    )
    assert not policy.is_page_link_tag(_link('<link rel="alternate" type="application/atom+xml" href="/c.atom">'))
    assert not policy.is_page_link_tag(_link('<link rel="stylesheet" href="https://fonts.example/css2?family=x">'))
    assert not policy.is_page_link_tag(_link('<link rel="preconnect" href="https://cdn.example">'))


def test_validator_skips_shop_flows_with_reason():
    assert _validate_crawl_url("https://www.shop.example/cart/1:1", BASE) == (False, "transactional_path")
    assert _validate_crawl_url("https://www.shop.example/p.oembed", BASE) == (False, "machine_endpoint")
    assert _validate_crawl_url("https://www.shop.example/pages/faqs", BASE) == (True, "allowed")


def _collect(html: str, *, max_links: int = 80, skip_header_footer: bool = True):
    from urllib.parse import urljoin

    from app.services.site_chrome_blocks import SITE_FOOTER, SITE_HEADER, extract_site_blocks

    soup = BeautifulSoup(html, "html.parser")
    chrome = extract_site_blocks(soup, want_header=False, want_footer=False)
    return policy.collect_page_links(
        soup.find_all(["a", "link", "area"], href=True),
        chrome.detached_links(SITE_HEADER) + chrome.detached_links(SITE_FOOTER),
        resolve=lambda href: urljoin(BASE, href),
        max_links=max_links,
        is_excluded=lambda tag: skip_header_footer and tag.find_parent(["header", "footer"]) is not None,
    )


STOREFRONT = """
<html><head>
  <link rel="alternate" type="application/json+oembed" href="/products/kajal.oembed">
</head><body>
  <header><a href="/collections/eyes">Eyes</a></header>
  <main>
    <a href="/products/kajal#reviews">Kajal</a>
    <a href="/products/kohl?pr_rec_id=9">Kohl</a>
    <article><footer><a href="/blogs/news/tagged">Tagged</a></footer></article>
  </main>
  <footer><a href="/pages/faqs">FAQ</a><a href="/pages/returns-refunds">Returns</a></footer>
</body></html>
"""


def test_footer_policy_pages_are_discovered_when_chrome_text_is_skipped():
    urls = _collect(STOREFRONT)
    assert "https://www.shop.example/pages/faqs" in urls
    assert "https://www.shop.example/pages/returns-refunds" in urls
    assert "https://www.shop.example/collections/eyes" in urls


def test_content_links_are_normalized_and_in_content_footers_still_skipped():
    urls = _collect(STOREFRONT)
    assert "https://www.shop.example/products/kajal" in urls
    assert "https://www.shop.example/products/kohl" in urls
    assert not any("oembed" in url or "/blogs/news/tagged" in url for url in urls)


def test_chrome_links_do_not_consume_the_per_page_cap():
    urls = _collect(STOREFRONT, max_links=1)
    assert urls[0] == "https://www.shop.example/products/kajal"
    assert "https://www.shop.example/products/kohl" not in urls
    assert "https://www.shop.example/pages/faqs" in urls


def test_repeated_links_count_once_toward_the_cap():
    page = STOREFRONT.replace(
        '<a href="/products/kajal#reviews">Kajal</a>',
        '<a href="/products/kajal">img</a><a href="/products/kajal#reviews">Kajal</a>',
    )
    urls = _collect(page, max_links=2)
    assert urls.count("https://www.shop.example/products/kajal") == 1
    assert "https://www.shop.example/products/kohl" in urls


def test_allowlist_can_opt_back_in():
    assert _validate_crawl_url("https://www.shop.example/cart", BASE, allowlist=["/cart*"]) == (True, "allowed")
