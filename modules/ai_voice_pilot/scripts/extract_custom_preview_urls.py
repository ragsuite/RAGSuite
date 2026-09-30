#!/usr/bin/env python3
"""Extract Azure Style Sample (General) preview URLs from speechsynthesis.online.

Writes backend/providers/data/custom_voice_preview_urls.json keyed by engine shortName
(e.g. en-US-BrianNeural). Dev/maintainer helper — not used at runtime.

Usage:
  python scripts/extract_custom_preview_urls.py
  python scripts/extract_custom_preview_urls.py --voices-js /path/to/voices-XXXX.js
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

_MODULE_ROOT = Path(__file__).resolve().parents[1]
_OUT_PATH = _MODULE_ROOT / "backend" / "providers" / "data" / "custom_voice_preview_urls.json"
_SS_ORIGIN = "https://speechsynthesis.online"
_VOICES_CHUNK_RE = re.compile(r'/(?:assets/)?voices-[^"\']+\.js')


def _fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "RAGSuite-preview-extract/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def _resolve_voices_js_url() -> str:
    html = _fetch(f"{_SS_ORIGIN}/")
    # Main bundle may reference the voices chunk.
    for m in _VOICES_CHUNK_RE.finditer(html):
        path = m.group(0)
        if not path.startswith("/"):
            path = "/" + path
        if "/assets/" not in path:
            path = "/assets" + path if path.startswith("/voices-") else path
        return f"{_SS_ORIGIN}{path}"
    index_m = re.search(r'src="(/assets/index-[^"]+\.js)"', html)
    if not index_m:
        raise RuntimeError("Could not find speechsynthesis index or voices chunk URL")
    index_js = _fetch(f"{_SS_ORIGIN}{index_m.group(1)}")
    chunk_m = _VOICES_CHUNK_RE.search(index_js)
    if not chunk_m:
        raise RuntimeError("Could not find voices-*.js reference in index bundle")
    path = chunk_m.group(0)
    if not path.startswith("/"):
        path = "/" + path
    if "/assets/" not in path:
        path = "/assets" + path if path.startswith("/voices-") else path
    return f"{_SS_ORIGIN}{path}"


def _extract_voice_objects(js: str) -> list[str]:
    """Return raw object source chunks that look like Azure voice entries."""
    chunks: list[str] = []
    i = 0
    needle = "{categories:"
    while True:
        j = js.find(needle, i)
        if j < 0:
            break
        depth = 0
        k = j
        while k < len(js):
            ch = js[k]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    k += 1
                    break
            k += 1
        chunks.append(js[j:k])
        i = k
    return chunks


def _general_preview_url(chunk: str) -> str | None:
    """Prefer styleName general; accept either key order in minified JS."""
    pairs = re.findall(
        r'styleName:"([^"]+)",audioFileEndpointWithSas:"([^"]+)"'
        r'|audioFileEndpointWithSas:"([^"]+)",styleName:"([^"]+)"',
        chunk,
    )
    for style_a, url_a, url_b, style_b in pairs:
        if style_a == "general" and url_a:
            return url_a
        if style_b == "general" and url_b:
            return url_b
    return None


def extract_preview_map(js: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for chunk in _extract_voice_objects(js):
        short_m = re.search(r'shortName:"([^"]+)"', chunk)
        if not short_m:
            continue
        short = short_m.group(1).strip()
        if not short:
            continue
        url = _general_preview_url(chunk)
        if not url:
            continue
        out[short] = url
    return dict(sorted(out.items()))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--voices-js",
        type=Path,
        help="Local voices-*.js path (skip download)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=_OUT_PATH,
        help=f"Output JSON path (default: {_OUT_PATH})",
    )
    args = parser.parse_args()

    if args.voices_js:
        js = args.voices_js.read_text(encoding="utf-8", errors="ignore")
        source = str(args.voices_js)
    else:
        url = _resolve_voices_js_url()
        print(f"Fetching {url}", file=sys.stderr)
        js = _fetch(url)
        source = url

    mapping = extract_preview_map(js)
    if not mapping:
        print("No General preview URLs found", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(mapping, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(mapping)} URLs from {source} → {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
