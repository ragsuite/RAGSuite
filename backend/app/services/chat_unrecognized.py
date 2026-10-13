"""Is a chat message made only of words nobody uses ("oipuiopuoiu", "giug ugjugj")?

Such a message names nothing, so it is neither a reply to the assistant's question nor a
follow-up: folded into the conversation, the rewriter turns it into one of the options the
assistant offered and that gets answered. It is resolved like a first message instead.

A word is recognized when it is a function or reply word of a supported language, holds a
digit (an order number, a code), is close to a word of the conversation (a typo in a reply)
or occurs in the project's indexed pages. The index is asked only when the cheaper checks
recognize nothing; when it cannot answer, the message counts as recognized.
"""
from __future__ import annotations

import difflib
import re
from functools import lru_cache
from typing import FrozenSet, Optional, Sequence, Set

from .chat_reference_signals import CONVERSATIONAL_TERMS, QUESTION_WORDS
from .chat_reply_signals import _ACK_WORDS
from .rag.stopwords import STOPWORDS

_WORD_RX = re.compile(r"[^\W_]+", re.UNICODE)
# Below this many letters a word is too short to judge ("a", "ok" are function words anyway).
_MIN_CHARS = 2
# A typo of a word in the conversation ("aplication" for "application").
_TYPO_SIMILARITY = 0.8
_TYPO_MIN_CHARS = 4
MAX_WORDS_CHECKED = 8


@lru_cache(maxsize=1)
def _function_words() -> FrozenSet[str]:
    words: Set[str] = set(CONVERSATIONAL_TERMS) | set(_ACK_WORDS) | set(QUESTION_WORDS.split("|"))
    for language_words in STOPWORDS.values():
        words |= language_words
    return frozenset(words)


def _words(text: str) -> list:
    return [w.lower() for w in _WORD_RX.findall(text or "")]


def _known_offline(word: str, conversation: Set[str]) -> bool:
    if any(ch.isdigit() for ch in word) or word in _function_words() or word in conversation:
        return True
    if len(word) < _TYPO_MIN_CHARS:
        return False
    return bool(difflib.get_close_matches(word, conversation, n=1, cutoff=_TYPO_SIMILARITY))


def is_unrecognized(message: str, conversation: Sequence[str], project_id: Optional[str]) -> bool:
    """Whether no word of ``message`` is recognized (see module docstring)."""
    words = list(dict.fromkeys(w for w in _words(message) if len(w) >= _MIN_CHARS))[:MAX_WORDS_CHECKED]
    if not words:
        return False
    vocabulary = {w for text in conversation for w in _words(text)}
    if any(_known_offline(w, vocabulary) for w in words):
        return False
    from .rag.lexical_index import project_words

    found = project_words(project_id, words)
    return found is not None and not found
