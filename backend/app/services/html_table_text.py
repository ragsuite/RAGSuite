"""Tables and definition lists as self-describing lines.

A table row written as ``Sole-Master Dry | Trocken | 10.00.00.36`` loses its meaning once
the chunker separates it from the header row. Rows are therefore written with their
column labels (``Typ: Sole-Master Dry; Ausführung: Trocken``), key/value tables and
``<dt>/<dd>`` pairs as ``Label: value`` — every line stays answerable on its own and the
item extractor reads them as attributes.
"""
from __future__ import annotations

from typing import Callable, List, Optional

from bs4.element import Tag

CellText = Callable[[Tag], str]
MIN_LABELLED_COLUMNS = 2


def _own_rows(table: Tag) -> List[Tag]:
    return [tr for tr in table.find_all("tr") if tr.find_parent("table") is table]


def _row_line(cells: List[Tag], texts: List[str], header: Optional[List[str]]) -> str:
    if header and len(header) == len(texts):
        pairs = [f"{h}: {v}" if h else v for h, v in zip(header, texts) if v]
        return "; ".join(pairs)
    if len(cells) == 2 and cells[0].name == "th" and texts[0] and texts[1]:
        return f"{texts[0]}: {texts[1]}"
    return " | ".join(t for t in texts if t)


def table_lines(table: Tag, cell_text: CellText) -> List[str]:
    lines: List[str] = []
    caption = table.find("caption", recursive=False)
    if caption is not None:
        lines.append(cell_text(caption))
    header: Optional[List[str]] = None
    data_rows = 0
    for tr in _own_rows(table):
        cells = tr.find_all(["td", "th"], recursive=False)
        texts = [cell_text(c) for c in cells]
        if not any(texts):
            continue
        if header is None and data_rows == 0 and len(cells) >= MIN_LABELLED_COLUMNS and all(c.name == "th" for c in cells):
            header = texts
            continue
        lines.append(_row_line(cells, texts, header))
        data_rows += 1
    if header and not data_rows:
        lines.append(" | ".join(t for t in header if t))
    return [line for line in lines if line]


def definition_lines(dl: Tag, cell_text: CellText) -> List[str]:
    lines: List[str] = []
    term: Optional[str] = None
    values: List[str] = []

    def flush() -> None:
        if term and values:
            lines.append(f"{term}: {', '.join(values)}")
        elif term or values:
            lines.append(term or ", ".join(values))

    nodes: List[Tag] = []
    for child in dl.children:
        if not isinstance(child, Tag):
            continue
        if child.name == "div":
            nodes.extend(c for c in child.children if isinstance(c, Tag))
        else:
            nodes.append(child)
    for node in nodes:
        if node.name == "dt":
            flush()
            term, values = cell_text(node), []
        elif node.name == "dd":
            value = cell_text(node)
            if value:
                values.append(value)
    flush()
    return [line for line in lines if line]
