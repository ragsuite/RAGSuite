"""How a partial item listing is summarised: the category breakdown of every matching item,
out-of-stock marks and the offer to narrow the list."""
from __future__ import annotations

import re
from typing import Any, List, Set

from ..rag.query_language import detect_text_language
from .answer_checks import price_spellings, priced_mentions
from .index import Entry
from .normalize import tokens
from .query import CatalogResult
from .shaping import unavailable

# Categories named in full; the rest are folded into "N more categories".
MAX_NAMED_CATEGORIES = 25
# Categories quoted in the suggested opening sentence.
LEAD_CATEGORIES = 3
# A listing answer must name at least half of its rows (checked from this many rows on).
MIN_ROWS_CHECKED = 3
NAME_CHECK_TOKENS = 4


def is_listing(r: CatalogResult) -> bool:
    return r.mode == "list" and not r.single and bool(r.rows)


def is_partial(r: CatalogResult) -> bool:
    """Only some of many matching items are shown."""
    return is_listing(r) and r.total > len(r.rows)


def _bounded(r: CatalogResult) -> bool:
    return "price_min" in r.filters or "price_max" in r.filters


def _names_row(e: Entry, text: Set[str]) -> bool:
    """The answer names the row by its own words, not the brand or category every row shares."""
    generic = set(tokens(e.brand or "")) | {t for label in [*e.category_path, e.category or ""] for t in tokens(label)}
    own = [t for t in tokens(e.display_name.split("(")[0]) if len(t) > 1 and t not in generic][:NAME_CHECK_TOKENS]
    return not own or sum(1 for t in own if t in text) * 5 >= len(own) * 3


def lists_too_few(r: CatalogResult, answer: str) -> bool:
    """A price-bounded listing answer that drops most of the rows it was given (every row is
    within the asked budget, so leaving one out is an error, not a judgement call).

    A row counts when the answer names it right before its own price: near-identical names
    ("SUGAR POP Liquid Foundation" / "SUGAR POP HD Liquid Foundation") share most words."""
    if not _bounded(r) or not is_listing(r) or len(r.rows) < MIN_ROWS_CHECKED:
        return False
    mentions = [(set(tokens(text)), values) for text, values in priced_mentions(answer)]
    listed = sum(
        1 for e in r.rows
        if e.price is not None and any(e.price in values and _names_row(e, words) for words, values in mentions)
    )
    return listed * 2 < len(r.rows)


def category_breakdown(r: CatalogResult) -> str:
    """``"Lipstick (14), Foundation (6), … other (24)"`` over every matching item."""
    counts: List[List[Any]] = r.category_counts
    named = [f"{c} ({n})" for c, n in counts[:MAX_NAMED_CATEGORIES]]
    hidden = len(counts) - len(named)
    if hidden > 0:
        named.append(f"{hidden} more categories ({sum(n for _, n in counts[MAX_NAMED_CATEGORIES:])})")
    uncategorised = r.total - sum(n for _, n in counts)
    if uncategorised > 0:
        named.append(f"other ({uncategorised})")
    return ", ".join(named)


def prompt_lines(r: CatalogResult) -> List[str]:
    lines: List[str] = []
    if r.category_counts:
        lines.append(f"All {r.total} matching items by category: {category_breakdown(r)}.")
        if is_partial(r):
            lead = ", ".join(f"{c} ({n})" for c, n in r.category_counts[:LEAD_CATEGORIES])
            lines.append(
                f'Open with one sentence giving the total and the main categories (e.g. "{r.total} items '
                f'match, including {lead} …"), then list the rows below grouped by category as examples.'
            )
        else:
            lines.append("Group the answer by category.")
    if is_listing(r):
        lines.append(f"Name every one of the {len(r.rows)} rows below; leave none out.")
        if _bounded(r):
            lines.append("Every row's selling price is within the asked range (its MRP may be higher); exclude none.")
    if any(unavailable(e) for e in r.rows):
        lines.append("Rows marked out of stock cannot be bought now: list them too, with that mark next to the item.")
    if is_partial(r):
        lines.append(
            "End with one short question offering to narrow the list (by category, or a lower budget); "
            "do not label it."
        )
    return lines


def with_total(r: CatalogResult, answer: str) -> str:
    """A partial listing answer that never says how many items match opens with the count and
    the main categories. Only English answers are completed; others keep the model's text."""
    if not is_partial(r) or not r.category_counts or not (answer or "").strip():
        return answer
    if any(re.search(rf"(?<![\d.,]){re.escape(s)}(?!\d)", answer) for s in price_spellings(r.total)):
        return answer
    if detect_text_language(answer) != "en":
        return answer
    lead = ", ".join(f"{c} ({n})" for c, n in r.category_counts[:LEAD_CATEGORIES])
    return f"{r.total} items match, including {lead} and more.\n\n{answer.lstrip()}"


def fallback_intro(r: CatalogResult) -> str:
    if r.category_counts:
        return f"{r.total} items match ({category_breakdown(r)}). A few of them:\n\n"
    return f"{r.total} items match; here are {len(r.rows)}:\n\n"


def fallback_outro(r: CatalogResult) -> str:
    if not r.category_counts:
        return ""
    top = r.category_counts[0][0]
    return f"\n\nWould you like the full list for one category, such as {top}?"
