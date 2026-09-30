"""Lightweight conversational intent for Voice Pilot.

Casual social / turn-taking utterances get a short spoken reply bank.
Everything informational goes to the existing RAG pipeline.
"""
from __future__ import annotations

import hashlib
import re
from typing import Literal, Optional

VoiceIntent = Literal[
    "casual_greeting",
    "casual_thanks",
    "casual_ack",
    "casual_goodbye",
    "casual_meta",
    "knowledge",
]

_PUNCT = re.compile(r"[^\w\s']+", re.UNICODE)
_MULTI_SPACE = re.compile(r"\s+")

_GREETING_EXACT = frozenset(
    {
        "hello",
        "hi",
        "hey",
        "hiya",
        "howdy",
        "yo",
        "good morning",
        "good afternoon",
        "good evening",
        "morning",
        "evening",
        "hello there",
        "hi there",
        "hey there",
    }
)

_HOW_ARE_YOU = frozenset(
    {
        "how are you",
        "how're you",
        "how are you doing",
        "how's it going",
        "hows it going",
        "how are you today",
        "hey how are you",
        "hi how are you",
        "hello how are you",
        "hey how's it going",
        "hi how's it going",
    }
)

_THANKS_EXACT = frozenset(
    {
        "thanks",
        "thank you",
        "thanks a lot",
        "thank you so much",
        "thanks so much",
        "thx",
        "ty",
        "appreciate it",
        "much appreciated",
        "okay thanks",
        "ok thanks",
        "thanks thanks",
    }
)

_ACK_EXACT = frozenset(
    {
        "okay",
        "ok",
        "k",
        "got it",
        "gotcha",
        "great",
        "cool",
        "nice",
        "interesting",
        "that's interesting",
        "thats interesting",
        "sounds good",
        "alright",
        "all right",
        "sure",
        "yep",
        "yeah",
        "yup",
        "right",
        "understood",
        "makes sense",
        "perfect",
        "awesome",
        "okay got it",
        "ok got it",
        "yes",
        "no",
        "nope",
    }
)

_GOODBYE_EXACT = frozenset(
    {
        "bye",
        "goodbye",
        "good bye",
        "see you",
        "see ya",
        "later",
        "talk later",
        "that's all",
        "thats all",
        "i'm done",
        "im done",
    }
)

_META_EXACT = frozenset(
    {
        "wait",
        "hold on",
        "hold up",
        "one sec",
        "one second",
        "give me a second",
        "give me a sec",
        "hang on",
        "hmm",
        "hm",
        "actually",
        "just a moment",
        "one moment",
    }
)

# Strong signals that this is a knowledge / domain ask (not pure social).
_KNOWLEDGE_HINTS = re.compile(
    r"\b("
    r"what|why|when|where|who|which|"
    r"how (?:do|does|did|can|could|would|should|is|are)|"
    r"explain|describe|define|"
    r"documentation|api|oauth|rag|embedding|embeddings|"
    r"authentication|integrat|"
    r"tell me more|another question|something else|"
    r"meant something|can you explain|can you tell"
    r")\b",
    re.IGNORECASE,
)

_CASUAL_REPLIES: dict[str, tuple[str, ...]] = {
    "casual_greeting": (
        "Hey! Good to hear from you.",
        "Hi there — what can I help with?",
        "Hello! I'm here if you have a question.",
        "Hey! Happy to help.",
    ),
    "casual_thanks": (
        "You're welcome.",
        "Anytime.",
        "Glad I could help.",
        "Of course — happy to help.",
    ),
    "casual_ack": (
        "Sounds good.",
        "Got it.",
        "Alright.",
        "Okay.",
    ),
    "casual_goodbye": (
        "Okay, I'll be here if you need me.",
        "Take care — talk soon.",
        "Bye for now.",
    ),
    "casual_meta": (
        "Sure — take your time.",
        "No rush.",
        "Okay, I'm listening.",
        "Go ahead when you're ready.",
    ),
}


def normalize_transcript(text: str) -> str:
    raw = (text or "").strip().lower()
    raw = _PUNCT.sub(" ", raw)
    raw = _MULTI_SPACE.sub(" ", raw).strip()
    return raw


def is_knowledge_shaped_query(text: str) -> bool:
    """True for short interrogative / informational phrasing that should hit RAG."""
    raw = (text or "").strip()
    if not raw:
        return False
    if "?" in raw:
        return True
    norm = normalize_transcript(raw)
    return bool(norm and _KNOWLEDGE_HINTS.search(norm))


def classify_voice_intent(text: str) -> VoiceIntent:
    """
    Classify a spoken transcript.

    Informational / follow-up questions always return ``knowledge``.
    Only clear social or turn-taking phrases return casual intents.
    """
    norm = normalize_transcript(text)
    if not norm:
        return "knowledge"

    # Pure social greetings (including "how are you") before knowledge hints.
    if norm in _GREETING_EXACT or norm in _HOW_ARE_YOU:
        return "casual_greeting"

    # Informational phrasing → RAG.
    if _KNOWLEDGE_HINTS.search(norm):
        return "knowledge"

    if norm in _THANKS_EXACT or (
        norm.startswith("thank") and len(norm.split()) <= 5
    ):
        return "casual_thanks"

    if norm in _ACK_EXACT:
        return "casual_ack"

    if norm in _GOODBYE_EXACT or norm in {"bye bye", "goodbye bye"}:
        return "casual_goodbye"

    if norm in _META_EXACT:
        return "casual_meta"

    words = norm.split()
    if len(words) <= 6 and (
        norm.startswith("wait")
        or norm.startswith("hold on")
        or norm.startswith("hmm")
        or "give me a second" in norm
        or "give me a sec" in norm
    ):
        return "casual_meta"

    return "knowledge"


def is_casual_intent(intent: VoiceIntent) -> bool:
    return intent != "knowledge"


def pick_casual_reply(intent: VoiceIntent, transcript: str) -> Optional[str]:
    """Deterministic reply from the bank (stable per transcript)."""
    if not is_casual_intent(intent):
        return None
    bank = _CASUAL_REPLIES.get(intent)
    if not bank:
        return None
    digest = hashlib.sha256(normalize_transcript(transcript).encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(bank)
    return bank[idx]


def resolve_casual_spoken_reply(text: str) -> Optional[str]:
    """If transcript is casual, return a spoken reply; else None (caller uses RAG)."""
    intent = classify_voice_intent(text)
    return pick_casual_reply(intent, text)
