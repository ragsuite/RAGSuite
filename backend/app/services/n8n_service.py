"""
n8n REST API client helpers (server-side only).
"""
from __future__ import annotations

import logging
from typing import Tuple
from urllib.parse import urlparse

import httpx

from ..security_utils import block_ssrf

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(15.0, connect=10.0)


def normalize_base_url(raw: str) -> str:
    url = (raw or "").strip().rstrip("/")
    if not url:
        raise ValueError("n8n instance URL is required.")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("n8n URL must use http or https.")
    if not parsed.netloc:
        raise ValueError("n8n URL must include a host.")
    # Strip workflow/editor paths if user pasted a workflow link
    for suffix in ("/workflow", "/workflows"):
        idx = url.lower().find(suffix)
        if idx > 0:
            url = url[:idx]
            break
    # Accept either instance root or API root; avoid double /api/v1 later
    if url.lower().endswith("/api/v1"):
        url = url[: -len("/api/v1")]
    return url.rstrip("/")


def n8n_api_root(base_url: str) -> str:
    """Instance root → …/api/v1 (n8n Cloud & self-hosted)."""
    return f"{normalize_base_url(base_url)}/api/v1"


def test_n8n_connection(base_url: str, api_key: str) -> Tuple[bool, str]:
    """
    Verify connectivity to the user's n8n instance.
    Returns (success, message).
    """
    instance_root = normalize_base_url(base_url)
    block_ssrf(instance_root)
    api_root = f"{instance_root}/api/v1"

    headers = {"X-N8N-API-KEY": api_key, "Accept": "application/json"}
    probe_urls = [
        f"{api_root}/workflows",
        f"{api_root}/users/me",
    ]

    response = None
    last_error = ""

    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=False) as client:
            for test_url in probe_urls:
                try:
                    response = client.get(test_url, headers=headers, params={"limit": 1})
                    if response.status_code < 500:
                        break
                except httpx.RequestError as exc:
                    last_error = str(exc)
                    continue
    except httpx.ConnectError:
        return False, "Cannot reach n8n instance. Check the URL and network access."
    except httpx.TimeoutException:
        return False, "Connection to n8n timed out. Check the URL and try again."
    except Exception as exc:
        logger.warning("n8n connection test failed: %s", exc)
        return False, f"Connection failed: {exc}"

    if response is None:
        return False, last_error or "Could not reach n8n API."

    if response.status_code == 401:
        return False, "Invalid n8n API key. In n8n go to Settings → n8n API and create or copy your key."
    if response.status_code == 403:
        return False, "n8n API key lacks permission. Check API scopes in n8n Settings → n8n API."
    if response.status_code == 404:
        return False, (
            "n8n API not found at {url}. Use your instance root only, e.g. "
            "https://nitsan.app.n8n.cloud (no /workflow/…). "
            "On n8n Cloud, the public API requires a paid plan (not free trial). "
            "Confirm Settings → n8n API is available and your API key is active. "
            "If you only use inbound (n8n → Ragsuite), you can ignore outbound test failures."
        ).format(url=f"{api_root}/workflows")
    if response.status_code >= 500:
        return False, f"n8n server error ({response.status_code}). Try again later."
    if response.status_code >= 400:
        detail = (response.text or "").strip()
        if not detail or "<html" in detail.lower() or "<!doctype" in detail.lower():
            detail = "Unexpected response from n8n — check the instance URL and API key."
        else:
            detail = detail[:200]
        return False, f"n8n rejected the request ({response.status_code}). {detail}".strip()

    return True, "Successfully connected to n8n."
