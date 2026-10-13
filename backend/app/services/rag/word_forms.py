"""Other spellings a page may use for the same fact as a query word.

A question names the person ("Who is the founder?") while the page states the act
("founded in 2015 by …"); the agent noun's verb forms let the keyword branch find it.
Rules are per language; a language without rules gets the word alone.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# (agent-noun ending, verb endings replacing it): "founder" → "founded", "founding".
_AGENT_FORMS: Dict[str, Tuple[Tuple[str, Tuple[str, ...]], ...]] = {
    "en": (("er", ("ed", "ing")), ("or", ("ed", "ing"))),
}
# Shorter words ending so are rarely agent nouns ("water", "color", "liner").
_AGENT_MIN_CHARS = 6
_PLURAL = {"en": "s"}
_ALPHA_RE = re.compile(r"^[^\W\d_]+$", re.UNICODE)


def related_forms(word: str, lang: Optional[str]) -> List[str]:
    """``word`` followed by the verb forms of it as an agent noun ("founders" → founded)."""
    forms = [word]
    rules = _AGENT_FORMS.get(lang or "", ())
    if not rules or not _ALPHA_RE.match(word):
        return forms
    plural = _PLURAL.get(lang or "", "")
    noun = word[: -len(plural)] if plural and word.endswith(plural) else word
    if len(noun) < _AGENT_MIN_CHARS:
        return forms
    for ending, verb_endings in rules:
        if noun.endswith(ending):
            base = noun[: -len(ending)]
            forms.extend(base + verb_ending for verb_ending in verb_endings)
            break
    return list(dict.fromkeys(forms))
