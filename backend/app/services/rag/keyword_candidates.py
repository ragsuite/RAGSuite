"""Chunk ids for the full-text keyword branch, in the order fusion should see them.

One broad OR query over all keywords ranks pages by how many query words they share, so
in a large collection an identifier's page ("EK-H1", "10.00.00.36") loses to passages full
of common words. Identifiers are therefore looked up exactly and placed ahead of the broad
hits; those lead ids are returned as ``priority`` so re-scoring and fusion keep them in
front. A code matching ``code_limit`` chunks or more (a material grade printed on every
product page, or a variant name such as "1100-Rechts" shared by several product lines)
does not identify a page by itself: the chunks containing it are ranked by the whole
question instead, and only those matching it about as well as the best one are kept, as
``scoped``. They are the rows naming both the product and the variant, so a broad query
that ranks or times out badly cannot lose them. A selective code identifies a page, not
only the chunks spelling it out: that page's other chunks matching the rest of the
question (the parts list of "EK-H1") are ``scoped`` as well. A hyphenated "code" that
matches nothing and holds a real word ("24-V-Sensoren" for the text "24 V - Sensoren") is
a compound, not an identifier: its parts are searched instead. A model name around a bare
number ("Edge 70 Pro") is an identifier too: the words in sequence are looked up like a
code, the full name first and, when nothing spells it, without its last word. A name
written as a capitalized hyphenated word ("Sole-Master Dry", "SSL-S") is looked up the
same way, whole, instead of as its common parts.

Full-text rank has no notion of rarity, and stems are prefix-matched ("founded" →
``found:*`` also hits "foundation"), so a fact stated once ("founded in 2015 by …") loses
to page chrome repeating a query word ("Note from founder" on every product). Query words
and their related forms (``word_forms``) that occur verbatim in only a few chunks are
therefore searched on their own, and the chunks containing them follow the identifier
hits as ``rare``. Such a chunk must also hold another word of the question, when it has
any (a rare Hinglish "kitne" alone picks Hindi blogs), and a related form only counts in
chunks lacking the asked word itself: it bridges a wording gap, so where the page uses
the word ("concealer" beside a rare "concealing") the ordinary ranking already applies.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Set

from . import lexical_index, query_keywords, word_forms

MAX_CODES = 3
# A word in at most this many chunks states a fact rather than repeating page chrome.
RARE_MAX_ROWS = 25
RARE_MIN_CHARS = 5
# Chunks with a shared code must match the question nearly as well as the best of them;
# a weak match (a catalog table cut off from its product heading) is another product's row.
SCOPED_MIN_RANK_RATIO = 0.25
# Only documents this small are pages whose chunks all describe the identified product.
PAGE_MAX_CHUNKS = 40


@dataclass
class KeywordCandidates:
    ids: List[str] = field(default_factory=list)
    priority: Set[str] = field(default_factory=set)
    scoped: Set[str] = field(default_factory=set)
    rare: Set[str] = field(default_factory=set)
    # The keywords actually searched (``surface`` with absent compounds split).
    terms: List[str] = field(default_factory=list)


def _ids(hits) -> List[str]:
    return [cid for cid, _rank in hits]


def _search_terms(surface: Sequence[str], lookups: Dict[str, List[str]], lang: Optional[str]) -> List[str]:
    """``surface`` with every looked-up code that matched nothing and is a hyphenated
    compound ("24-v-sensoren") replaced by its word parts."""
    terms: List[str] = []
    for term in surface:
        parts = query_keywords.compound_word_parts(term, lang) if lookups.get(term) == [] else []
        terms.extend(parts or [term])
    return list(dict.fromkeys(terms))


def _phrase_lookup(
    collection_name: str, project_id: Optional[str], phrases: Sequence[str],
    scope: Optional[List[str]], code_limit: int,
) -> Dict[str, List[str]]:
    """``{phrase: hits}`` for the first (longest) of ``phrases`` spelled in the collection."""
    for phrase in phrases:
        hits = _ids(lexical_index.search(
            collection_name, project_id, [phrase], limit=code_limit, lang=None, source_ids=scope,
        ))
        if hits:
            return {phrase: hits}
    return {}


def _strong_ids(hits) -> List[str]:
    best = max((rank for _cid, rank in hits), default=0.0)
    return [cid for cid, rank in hits if best > 0 and rank >= best * SCOPED_MIN_RANK_RATIO]


def _rare_forms(
    collection_name: str, project_id: Optional[str], terms: Sequence[str], lang: Optional[str],
) -> Dict[str, List[str]]:
    """``{query word: its forms found verbatim in 1..RARE_MAX_ROWS chunks}`` (the word itself
    first when it is rare)."""
    forms = {
        term: word_forms.related_forms(term, lang)
        for term in terms
        if len(term) >= RARE_MIN_CHARS and not query_keywords.is_code(term)
    }
    if not forms:
        return {}
    every = [form for group in forms.values() for form in group]
    counts = lexical_index.term_counts(collection_name, project_id, every, RARE_MAX_ROWS + 1)
    rare = {
        term: [form for form in group if 0 < counts.get(form, 0) <= RARE_MAX_ROWS]
        for term, group in forms.items()
    }
    return {term: group for term, group in rare.items() if group}


def _rare_hits(
    collection_name: str, project_id: Optional[str], terms: List[str], lang: Optional[str],
    scope: Optional[List[str]],
) -> List[str]:
    """Chunks holding a rare form of a query word (see module docstring), per word."""
    hits: List[str] = []
    for term, forms in _rare_forms(collection_name, project_id, terms, lang).items():
        others = [t for t in terms if t != term]
        hits.extend(_ids(lexical_index.search(
            collection_name, project_id, others or [term] + forms, limit=RARE_MAX_ROWS,
            lang=lang, source_ids=scope, required=forms, absent=[] if term in forms else [term],
        )))
    return list(dict.fromkeys(hits))


def gather(
    collection_name: str,
    project_id: Optional[str],
    surface: Sequence[str],
    lang: Optional[str],
    source_ids: Optional[Sequence[str]],
    *,
    limit: int,
    code_limit: int,
    identifiers: Sequence[str] = (),
    names: Sequence[str] = (),
) -> KeywordCandidates:
    """Selective identifier hits first, then question-ranked chunks of shared identifiers,
    then the broad keyword hits (deduplicated, ``limit``). ``identifiers`` are further
    keywords to look up like codes (``query_keywords.capitalized_codes``); ``names`` are
    product-name phrases, longest first (``query_keywords.name_phrases``)."""
    scope = list(source_ids) if source_ids else None
    codes = query_keywords.code_terms(surface) + [term for term in identifiers if term in surface]
    lookups = {
        code: _ids(lexical_index.search(
            collection_name, project_id, [code], limit=code_limit, lang=None, source_ids=scope,
        ))
        for code in list(dict.fromkeys(codes))[:MAX_CODES]
    }
    terms = _search_terms(surface, lookups, lang)
    for phrases in (query_keywords.number_phrases(surface), names):
        lookups.update(_phrase_lookup(collection_name, project_id, phrases, scope, code_limit))
    code_hits: List[str] = []
    scoped_hits: List[str] = []
    for code, hits in lookups.items():
        if len(hits) < code_limit:
            code_hits.extend(hits)
        elif len(terms) > 1:
            scoped_hits.extend(_strong_ids(lexical_index.search(
                collection_name, project_id, terms, limit=code_limit, lang=lang,
                source_ids=scope, required=[code],
            )))
    lead = list(dict.fromkeys(code_hits))
    others = [term for term in terms if not query_keywords.is_code(term)]
    if lead and others:
        pages = lexical_index.page_documents(collection_name, project_id, lead, PAGE_MAX_CHUNKS)
        if pages:
            siblings = _strong_ids(lexical_index.search(
                collection_name, project_id, others, limit=code_limit, lang=lang, document_ids=pages,
            ))
            scoped_hits.extend(cid for cid in siblings if cid not in lead)
    rare_hits = _rare_hits(collection_name, project_id, terms, lang, scope)
    broad = _ids(lexical_index.search(
        collection_name, project_id, terms, limit=limit, lang=lang, source_ids=scope,
    ))
    head = list(dict.fromkeys(lead + scoped_hits + rare_hits))
    ids = list(dict.fromkeys(head + broad))[: max(limit, len(head))]
    return KeywordCandidates(
        ids=ids, priority=set(lead), scoped=set(scoped_hits) - set(lead),
        rare=set(rare_hits) - set(lead) - set(scoped_hits), terms=terms,
    )
