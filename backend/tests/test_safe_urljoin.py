"""Tests for crawl link resolution (_safe_urljoin, _extract_document_base_url)."""

from bs4 import BeautifulSoup

from app.services.crawler import _extract_document_base_url, _safe_urljoin


def test_root_relative_not_rescoped_by_default():
  page = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/darmkrebszentrum/"
  href = "/darmkrebszentrum/darmkrebs-was-nun/diagnostik"
  start = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/"

  result = _safe_urljoin(page, href, start)

  assert result == "https://www.heh-bs.de/darmkrebszentrum/darmkrebs-was-nun/diagnostik"


def test_root_relative_rescoped_when_cms_mode_enabled():
  page = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/darmkrebszentrum/"
  href = "/darmkrebszentrum/darmkrebs-was-nun/diagnostik"
  start = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/"

  result = _safe_urljoin(page, href, start, rescope_root_links=True)

  assert (
      result
      == "https://www.heh-bs.de/kliniken-zentren-einrichtungen/darmkrebszentrum/darmkrebs-was-nun/diagnostik"
  )


def test_absolute_href_unchanged_regardless_of_mode():
  page = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/"
  href = "https://www.heh-bs.de/darmkrebszentrum/darmkrebs-was-nun/diagnostik"
  start = "https://www.heh-bs.de/kliniken-zentren-einrichtungen/"

  assert _safe_urljoin(page, href, start) == href
  assert _safe_urljoin(page, href, start, rescope_root_links=True) == href


def test_doubled_relative_path_still_fixed_without_cms_mode():
  page = "https://www.base.bund.de/portal/DE/Service/ABC/"
  href = "service.html"
  start = "https://www.base.bund.de/"

  result = _safe_urljoin(page, href, start)

  assert result == "https://www.base.bund.de/service.html"


def test_extract_document_base_url_uses_base_href():
  page = "https://docs.example.com/en/latest/page.html"
  html = '<html><head><base href="/en/latest/"></head><body></body></html>'
  soup = BeautifulSoup(html, "html.parser")

  assert _extract_document_base_url(soup, page) == "https://docs.example.com/en/latest/"


def test_extract_document_base_url_falls_back_to_page_url():
  page = "https://docs.example.com/en/latest/page.html"
  soup = BeautifulSoup("<html><body></body></html>", "html.parser")

  assert _extract_document_base_url(soup, page) == page


def test_extract_document_base_url_ignores_cross_origin_base():
  page = "https://docs.example.com/en/latest/page.html"
  html = '<html><head><base href="https://evil.example.com/"></head></html>'
  soup = BeautifulSoup(html, "html.parser")

  assert _extract_document_base_url(soup, page) == page


def test_link_resolution_uses_base_href_before_cms_mode():
  page = "https://docs.example.com/en/latest/page.html"
  html = '<html><head><base href="/en/latest/"></head></html>'
  soup = BeautifulSoup(html, "html.parser")
  link_base = _extract_document_base_url(soup, page)
  start = "https://docs.example.com/en/latest/"

  result = _safe_urljoin(link_base, "api/reference.html", start)

  assert result == "https://docs.example.com/en/latest/api/reference.html"
