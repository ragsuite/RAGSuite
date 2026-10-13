"""Item records as answer context: the prompt block, the deterministic fallback answer and
the checks that keep the model's answer consistent with the rows."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import list_summary
from .answer_checks import denies_rows, leads_with_row, price_spellings, states_price
from .index import Entry
from .normalize import tokens
from .query import CatalogResult
from .row_text import MAX_FIELDS, money, price_order, row_line  # noqa: F401 (money re-exported)
from .shaping import unavailable

# Lookups and comparisons show few rows, so each row can carry its full detail table.
FEW_ROWS = 3
MAX_FIELDS_FEW_ROWS = 8
# Leading name words that must appear for an answer to name the item (feature words follow).
NAME_CHECK_TOKENS = 4


@dataclass
class ItemContext:
    result: CatalogResult
    question: str = ""

    @property
    def has_rows(self) -> bool:
        return self.result.has_rows

    @property
    def document_ids(self) -> List[str]:
        return self.result.document_ids()

    @property
    def rows(self) -> List[Entry]:
        return self.result.rows

    def evidence_requests(self) -> List[Tuple[str, List[str]]]:
        """``(document_id, hints)`` per selected page: values its evidence chunk should carry."""
        by_id = {e.document_id: e for e in [*self.result.rows, *self.result.closest]}
        out: List[Tuple[str, List[str]]] = []
        for doc_id in self.document_ids:
            e = by_id.get(doc_id)
            hints: List[str] = []
            if e is not None:
                hints.append(" ".join(e.display_name.split("(")[0].split()[:3]))
                if e.price is not None:
                    hints.extend(price_spellings(e.price))
            out.append((doc_id, hints))
        return out

    def _passage_of(self, passage_doc_ids: Sequence[Optional[str]]) -> Dict[str, int]:
        out: Dict[str, int] = {}
        for i, doc_id in enumerate(passage_doc_ids):
            if doc_id and str(doc_id) not in out:
                out[str(doc_id)] = i + 1
        return out

    def passage_indices(self, passage_doc_ids: Sequence[Optional[str]]) -> List[int]:
        where = self._passage_of(passage_doc_ids)
        picked = [where[e.document_id] for e in (self.rows or self.result.closest) if e.document_id in where]
        return sorted(set(picked))

    def _scope(self) -> str:
        r = self.result
        bits = []
        if r.categories:
            bits.append(" / ".join(r.categories[:2]))
        if r.brands:
            bits.append("brand " + ", ".join(r.brands[:3]))
        f = r.filters
        if "price_min" in f or "price_max" in f:
            cur = r.rows[0].currency if r.rows else None
            lo, hi = money(f.get("price_min"), cur), money(f.get("price_max"), cur)
            bits.append(f"price {lo or '…'} – {hi or '…'}")
        if f.get("measures"):
            bits.append(", ".join(f["measures"]))
        if f.get("terms"):
            bits.append("with " + ", ".join(f["terms"]))
        return "; ".join(bits)

    def prompt_block(self, passage_doc_ids: Sequence[Optional[str]]) -> str:
        r = self.result
        where = self._passage_of(passage_doc_ids)
        lines = [
            "ITEM RECORDS (exact values read from the item pages; use them for item names, prices, "
            "counts and ordering, and do not add items that are not listed here):"
        ]
        if r.mode == "missing":
            lines.append(
                f'No item matching "{r.requested}" exists in the indexed pages. Say plainly that it is '
                "not available; you may offer the closest items below as alternatives (say they differ)."
            )
        elif r.mode == "lookup" and not r.exact:
            lines.append(
                "These are the closest items to what the user named; the names are not identical. "
                "Present them as the closest match and state the exact item name."
            )
        elif r.mode == "brands":
            brands = ", ".join(f"{b} ({n})" for b, n in r.brand_counts)
            lines.append(f"Brands with matching items ({self._scope() or 'all'}): {brands}. List every brand.")
            lines.append("One example item per brand:")
        elif r.mode == "list":
            order = {"low": "lowest price first", "high": "highest price first"}.get(r.sort or "", "")
            if r.rank is not None:
                order = f"ranked by {r.rank.label()}, from the item specs"
            shown = len(r.rows)
            lines.append(
                f"{r.total} item(s) match ({self._scope() or 'all items'}); showing {shown}"
                + (f", {order}" if order else "") + "."
            )
            if order and r.rank is None:
                lines.append(
                    "This order is by current selling price across the whole catalog; MRP is the pre-discount "
                    "list price. Rank by these rows, not by prices seen in the passages."
                )
            if not r.rows and r.closest:
                lines.append("None matches every requested value; the closest items are below (say so).")
            lines.extend(list_summary.prompt_lines(r))
            if not r.single and len(r.rows) > 2:
                lines.append("Write one line per item (name — price, at most one key spec); no nested spec bullets.")
        if r.filters.get("compared"):
            lines.append("The user compares these items: give each item's name and price from its rows.")
            order = price_order(r.rows)
            if order:
                lines.append(order)
        if r.filters.get("unmatched_items"):
            lines.append(
                f"Not in the indexed pages: {', '.join(r.filters['unmatched_items'])}. Say so; do not invent its price."
            )
        if r.filters.get("ignored"):
            lines.append(f"No item mentions: {', '.join(r.filters['ignored'])}. These rows match the rest of the question.")
        if r.mode == "lookup" and r.filters.get("unmatched"):
            lines.append(
                f"No listed variant of this item has {', '.join(r.filters['unmatched'])}; say that first, "
                "then name the variants below."
            )
        if r.single and len(r.rows) > 1:
            lines.append(f"The user asked for one item; rows 1-{len(r.rows)} share the same price, so name each of them.")
        elif r.single and r.rows:
            lines.append("The user asked for one item: answer with row 1 only.")
        rows = r.rows or r.closest
        asked = set(tokens(self.question))
        field_cap = MAX_FIELDS_FEW_ROWS if len(rows) <= FEW_ROWS else MAX_FIELDS
        for n, e in enumerate(rows, 1):
            lines.append(
                row_line(n, e, where.get(e.document_id), self._ranked_value(e), asked=asked, field_cap=field_cap)
            )
        alternatives = self._alternatives()
        if alternatives:
            wanted = ", ".join(r.filters["alternatives_for"])
            lines.append(
                f"OTHER ITEMS IN {wanted.upper()} (different items, not variants of the item above). End the answer "
                f'with one line "Available in {wanted} instead:" naming these items with their prices; '
                "suggest no other items:"
            )
            for n, e in enumerate(alternatives, len(rows) + 1):
                lines.append(row_line(n, e, where.get(e.document_id)))
        return "\n".join(lines)

    def _alternatives(self) -> List[Entry]:
        r = self.result
        return r.closest if r.mode == "lookup" and r.rows and r.filters.get("alternatives_for") else []

    def complete(self, answer: str) -> str:
        """A consistent answer plus what it left out: the offered alternatives, the match count."""
        return list_summary.with_total(self.result, self.with_alternatives(answer))

    def with_alternatives(self, answer: str) -> str:
        """The answer plus the "available in <value> instead" line when the model left it out."""
        alternatives, text = self._alternatives(), set(tokens(answer or ""))
        if not alternatives or not text or any(self._names(e, text) for e in alternatives):
            return answer
        named = "; ".join(f"**{e.display_name}** – {money(e.price, e.currency)}".rstrip(" –") for e in alternatives)
        return f"{answer.rstrip()}\n\nAvailable in {', '.join(self.result.filters['alternatives_for'])} instead: {named}."

    def _ranked_value(self, e: Entry) -> str:
        rank = self.result.rank
        value = rank.values.get(e.document_id) if rank else None
        if value is None:
            return ""
        shown = int(value) if value == int(value) else value
        return f"{rank.attribute}: {shown} {rank.unit}"

    def fallback_answer(self) -> str:
        """Deterministic answer used when the model refuses or contradicts the rows."""
        r = self.result
        if r.mode == "missing":
            names = ", ".join(e.display_name for e in r.closest[:3])
            return "That exact item isn't available in the catalog." + (f" Closest matches: {names}." if names else "")
        if r.mode == "brands":
            items = "\n".join(f"- **{b}** ({n} item{'s' if n != 1 else ''})" for b, n in r.brand_counts)
            return f"These brands are available:\n\n{items}"
        rows = r.rows or r.closest
        if not rows:
            return ""
        intro = ""
        if r.mode == "lookup" and r.filters.get("unmatched"):
            intro = f"No listed variant has {', '.join(r.filters['unmatched'])}. The available variants are:\n\n"
        elif r.mode == "lookup" and not r.exact:
            intro = "I couldn't find that exact name; the closest match is:\n\n"
        elif r.mode == "list" and not r.rows:
            intro = "No item matches every requested value; the closest items are:\n\n"
        elif list_summary.is_partial(r):
            intro = list_summary.fallback_intro(r)
        elif r.single and r.rank is not None:
            intro = f"Of {r.total} matching items, the {r.rank.label()} is:\n\n"
        elif r.single and r.sort in ("high", "low"):
            scope = f" ({self._scope()})" if self._scope() else ""
            edge = "highest" if r.sort == "high" else "lowest"
            intro = f"Of {r.total} matching items{scope}, the {edge} price is:\n\n"
        answer = intro + "\n".join(self._bullet(e) for e in rows)
        alternatives = self._alternatives()
        if alternatives:
            wanted = ", ".join(r.filters["alternatives_for"])
            answer += f"\n\nOther items available in {wanted}:\n\n" + "\n".join(self._bullet(e) for e in alternatives)
        if list_summary.is_partial(r):
            answer += list_summary.fallback_outro(r)
        return answer

    def _bullet(self, e: Entry) -> str:
        bits = [f"**{e.display_name}**"]
        if self._ranked_value(e):
            bits.append(self._ranked_value(e))
        if e.price is not None:
            mrp = e.list_price is not None and e.list_price > e.price
            bits.append(money(e.price, e.currency) + (f" (MRP {money(e.list_price, e.currency)})" if mrp else ""))
        if unavailable(e):
            bits.append(e.availability)
        if e.highlights:
            bits.append(", ".join(e.highlights[:2]))
        return "- " + " — ".join(bits)

    def contradicts(self, answer: str) -> Optional[str]:
        """Reason the answer conflicts with the rows (``None`` when consistent)."""
        r = self.result
        text = set(tokens(answer or ""))
        if not text or not r.rows:
            return None
        if r.mode == "brands":
            named = sum(1 for b, _ in r.brand_counts if set(tokens(b)) <= text)
            return "missing_brands" if named < max(1, (len(r.brand_counts) + 1) // 2) else None
        if r.single and r.rank is not None:
            if not any(self._names(top, text) for top in r.rows):
                return "wrong_item"
        elif r.single or r.sort:
            tops = r.rows if r.single else r.rows[:1]
            if not any(self._names(top, text) and states_price(top, answer) for top in tops):
                return "wrong_item"
            bounds = [v for k in ("price_min", "price_max") if isinstance(v := r.filters.get(k), (int, float))]
            if r.single and not leads_with_row(tops, answer, bounds):
                return "wrong_item"
        if list_summary.lists_too_few(r, answer):
            return "incomplete_list"
        exact_rows = r.mode == "list" or (r.mode == "lookup" and r.exact and not r.filters.get("unmatched"))
        if exact_rows and denies_rows(r.rows, answer, r.requested):
            return "denied_rows"
        return None

    @staticmethod
    def _names(top: Entry, text: set) -> bool:
        generic = {t for label in [*top.category_path, top.category or ""] for t in tokens(label)}
        core = [t for t in tokens(top.display_name.split("(")[0]) if len(t) > 1 and t not in generic][:NAME_CHECK_TOKENS]
        return not core or sum(1 for t in core if t in text) >= max(1, -(-len(core) * 3 // 5))

    def to_meta(self) -> Dict[str, Any]:
        return self.result.to_meta()
