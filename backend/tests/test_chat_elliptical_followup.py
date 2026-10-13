"""Short subject-less follow-ups ("are you sure?", "any other brands?", "price without offer")."""
import asyncio

import pytest

from app.services import chat_contextualize as cctx
from app.services import chat_query_context as cqc
from app.services import chat_topic_memory as ctm
from app.services.chat_reference_signals import is_elliptical_followup
from app.services.chat_topic_memory import TopicFrame
from app.services.rag.query_processing import process_query, strip_filler

PROJECT_ID = "00000000-0000-0000-0000-000000000001"

LAPTOP_ANSWER = (
    "Here are key laptop recommendations: For Gaming: Acer Predator, HP Victus. "
    "For Students: ASUS Vivobook, Dell Inspiron. For Basic Usage: Acer Aspire 3."
)
RED_HISTORY = [
    {"type": "user", "content": "i need to buy the laptop"},
    {"type": "assistant", "content": LAPTOP_ANSWER},
    {"type": "user", "content": "okay! which laptop is in red. I need to buy the red color"},
    {"type": "assistant", "content": "The documents do not mention any laptops available in **red color**."},
]
SPEAKER_HISTORY = [
    {"type": "user", "content": "please share me the blooth speaker specification"},
    {"type": "assistant", "content": "Specifications for **JBL Bluetooth speakers**: JBL Go 4, 4.2W, Colors: Black, Pink."},
]
SHOE_HISTORY = [
    {"type": "user", "content": "please share the discount options for the shoes"},
    {"type": "assistant", "content": "Discount options for shoes include 60% or more off and Special Price offers."},
    {"type": "user", "content": "share for the athleo"},
    {"type": "assistant", "content": "The **Athleo BULLET-250** running shoes: Price ₹631 after offers (original price ₹2,499)."},
]
PAYSAFE_HISTORY = [
    {"type": "user", "content": "Does paysafecard manufacture stainless steel kitchen sinks?"},
    {"type": "assistant", "content": "No. paysafecard is a prepaid payment method, not a manufacturer."},
]
PHONE_HISTORY = [
    {"type": "user", "content": "motorola edge 70 fusion price"},
    {"type": "assistant", "content": "The **Motorola Edge 70 Fusion** (Pantone BLUE SURF) is listed at ₹30,999."},
    {"type": "user", "content": "in red color available?"},
    {"type": "assistant", "content": "The Motorola Edge 70 Fusion is listed only in Pantone BLUE SURF."},
]
GERMAN_HISTORY = [
    {"type": "user", "content": "Welche Artikelnummer hat der Sole-Master Dry?"},
    {"type": "assistant", "content": "Der **Sole-Master Dry** hat die Artikelnummer 10.00.00.36."},
]
PLURAL_SHOE_HISTORY = [
    {"type": "user", "content": "share for the athleo"},
    {"type": "assistant", "content": "Athleo N-802: original ₹3,399 → ₹768 with bank offers and Big Billion Days prices."},
]


class _Factory:
    def __init__(self, text):
        self.text, self.prompts = text, []

    def get_llm(self, provider, model, api_key):
        factory = self

        class _LLM:
            def complete(self, prompt):
                factory.prompts.append(prompt)
                return type("R", (), {"text": factory.text})()

        return _LLM()


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_CLARIFY", raising=False)
    monkeypatch.delenv("RAG_QUERY_PROCESSING", raising=False)
    monkeypatch.setattr(ctm.source_routing, "match_source_ids", lambda _pid, _text: [])


def _elliptical(message, history):
    return is_elliptical_followup(message, history, named_entities=process_query(message).entities)


@pytest.mark.parametrize(
    "message,history",
    [
        ("are you sure ?", RED_HISTORY),
        ("any other brands available ?", SPEAKER_HISTORY),
        ("share price without offer", SHOE_HISTORY),
        ("share price without offer", PLURAL_SHOE_HISTORY),
        ("what about the sizes", PLURAL_SHOE_HISTORY),
        ("Okay what else?", SPEAKER_HISTORY),
        ("so red is not available right", PHONE_HISTORY),
        ("correct, so only blue", PHONE_HISTORY),
        ("hmm ok so not in red", PHONE_HISTORY),
        ("true?", PHONE_HISTORY),
        ("give me the 256gb one", PHONE_HISTORY),
        ("ok and the 512 version?", PHONE_HISTORY),
        ("what about RAM", PHONE_HISTORY),
        ("hmm and warranty?", PHONE_HISTORY),
        ("and the motorola one, what was its price again?", PHONE_HISTORY),
        ("und die Nass-Version?", GERMAN_HISTORY),
        ("und die Artikelnummer vom Koffer?", GERMAN_HISTORY),
        ("welche Bürstenlänge hat die 1500er Rechts-Version?", GERMAN_HISTORY),
        ("welche Maße hat er?", GERMAN_HISTORY),
        ("kann man den auch trocken betreiben?", GERMAN_HISTORY),
        ("wirklich?", GERMAN_HISTORY),
        ("bist du sicher?", GERMAN_HISTORY),
        ("et la version 800 ?", GERMAN_HISTORY),
        ("y el modelo grande?", GERMAN_HISTORY),
        ("in yellow color", PHONE_HISTORY),
        ("with 512 GB SSD", PHONE_HISTORY),
        ("ok for Gaming?", RED_HISTORY),
        ("mit Deckel?", GERMAN_HISTORY),
        ("sans fil ?", GERMAN_HISTORY),
    ],
)
def test_subject_less_followups_are_elliptical(message, history):
    assert _elliptical(message, history)


@pytest.mark.parametrize(
    "message,history",
    [
        ("please share me the blooth speaker specification", RED_HISTORY),
        ("I need the neckband in purpole color", SPEAKER_HISTORY),
        ("I want to buy the papershop", SPEAKER_HISTORY),
        ("is motorola edge 70 pro available in 12/256?", SHOE_HISTORY),
        ("What is the price of the Sole-Master Dry?", SHOE_HISTORY),
        ("What is paysafecard?", PAYSAFE_HISTORY),
        ("How can I pay online with paysafecard?", PAYSAFE_HISTORY),
        ("Do you sell smartphones?", SPEAKER_HISTORY),
        ("toy cube fast finger game", SPEAKER_HISTORY),
        ("are you sure ?", []),
        ("Was ist ProfilGate?", GERMAN_HISTORY),
        ("Welche Produkte bietet Mohn für Reinräume an?", GERMAN_HISTORY),
        ("e-bike prices in Berlin?", PHONE_HISTORY),
        ("is the iPad available in yellow?", PHONE_HISTORY),
        ("in yellow color", []),
        ("und die Nass-Version?", []),
    ],
)
def test_new_topics_named_subjects_and_first_turns_are_not_elliptical(message, history):
    assert not _elliptical(message, history)


@pytest.mark.parametrize("message", ["expiry date?", "shelf life", "n the stroke of genius one?"])
def test_bare_phrases_and_chat_shorthand_continue_the_exchange(message):
    assert _elliptical(message, PHONE_HISTORY)
    assert not _elliptical(message, [])


@pytest.mark.parametrize("message", [
    "I want most popular", "which is the most expensive?", "le plus cher ?", "el más barato",
])
def test_superlative_without_its_noun_is_elliptical(message):
    assert _elliptical(message, PHONE_HISTORY)


@pytest.mark.parametrize("message", [
    "what is the most popular lipstick", "most popular gift sets", "I am most happy with lipstick",
])
def test_superlative_with_its_own_noun_is_not_elliptical(message):
    assert not _elliptical(message, PHONE_HISTORY)


def test_question_with_its_own_subject_is_not_a_bare_phrase():
    assert not _elliptical("how many days to return", PHONE_HISTORY)
    assert not _elliptical("which payment methods accepted", PHONE_HISTORY)


def test_long_messages_are_never_elliptical():
    message = "please review the laptop and share the color available options for me today"
    assert not _elliptical(message, RED_HISTORY)


def _resolve(message, history, rewrite, **kwargs):
    calls = []

    async def _contextualize(msg, hist, **ctx):
        calls.append(ctx)
        return rewrite, False

    res = asyncio.run(cqc.resolve_chat_query(
        message, history, history,
        project_id=PROJECT_ID, language_hint="en", contextualize=_contextualize, **kwargs,
    ))
    return res, calls


def test_question_about_items_shown_is_rewritten():
    message = "how many shades are there?"
    assert not _elliptical(message, RED_HISTORY)
    res, calls = _resolve(message, RED_HISTORY, message)
    assert not calls and res.reason == "standalone"
    rewrite = "How many shades does the laptop come in?"
    res, calls = _resolve(message, RED_HISTORY, rewrite, continues_items=True)
    assert calls and calls[0]["elliptical"] is True
    assert res.reason == "contextualized" and res.rag_query == rewrite


def test_verification_turn_is_rewritten_with_elliptical_flag():
    res, calls = _resolve("are you sure ?", RED_HISTORY, "Which laptops are available in red color?")
    assert calls and calls[0]["elliptical"] is True
    assert res.reason == "contextualized" and not res.is_ambiguous
    assert res.rag_query == "Which laptops are available in red color?"


def test_german_variant_followup_is_rewritten_with_elliptical_flag():
    rewrite = "Welche Artikelnummer hat der Sole-Master Nass?"
    res, calls = _resolve("und die Nass-Version?", GERMAN_HISTORY, rewrite)
    assert calls and calls[0]["elliptical"] is True
    assert res.reason == "contextualized" and res.rag_query == rewrite


def test_new_topic_stays_standalone_without_llm():
    res, calls = _resolve("please share me the blooth speaker specification", RED_HISTORY, "unused")
    assert not calls and res.reason == "standalone"


def test_contextualized_followups_carry_history_to_the_answer():
    res, _ = _resolve("share price without offer", SHOE_HISTORY, "What is the price of Athleo shoes without the offer?")
    assert res.answer_history("share price without offer", SHOE_HISTORY) == SHOE_HISTORY[-4:]
    standalone, _ = _resolve("please share me the blooth speaker specification", RED_HISTORY, "unused")
    assert standalone.answer_history("please share me the blooth speaker specification", RED_HISTORY) is None


def test_elliptical_bypasses_pronoun_gate_and_referent_precheck():
    """'are you sure?' has no pronoun and several brands are in history — still rewritten."""
    history = [
        {"type": "user", "content": "Do Acer Aspire or Asus Vivobook laptops come in red?"},
        {"type": "assistant", "content": "Neither the Acer Aspire nor the Asus Vivobook is listed in red."},
    ]
    factory = _Factory("Do Acer Aspire or Asus Vivobook laptops come in red?")
    out = asyncio.run(cctx.contextualize_query(
        "are you sure ?", history, {}, llm_factory=factory, elliptical=True,
        topic=TopicFrame(entities=("Acer Aspire", "Asus Vivobook"), terms=("laptops",)),
    ))
    assert out == ("Do Acer Aspire or Asus Vivobook laptops come in red?", False)
    assert "are you sure?" in factory.prompts[0]


def test_without_elliptical_flag_no_pronoun_means_no_llm_call():
    factory = _Factory("unused")
    out = asyncio.run(cctx.contextualize_query("are you sure ?", RED_HISTORY, {}, llm_factory=factory))
    assert out == ("are you sure ?", False) and not factory.prompts


def test_prompt_has_alternatives_and_bare_attribute_rules():
    factory = _Factory("Which speaker brands other than JBL are available?")
    asyncio.run(cctx.contextualize_query(
        "any other brands available ?", SPEAKER_HISTORY, {}, llm_factory=factory, elliptical=True,
    ))
    prompt = factory.prompts[0]
    assert "Requests for alternatives" in prompt
    assert "A bare attribute or condition without a subject" in prompt


class _SequenceFactory:
    def __init__(self, *texts):
        self.texts, self.prompts = list(texts), []

    def get_llm(self, provider, model, api_key):
        factory = self

        class _LLM:
            def complete(self, prompt):
                factory.prompts.append(prompt)
                return type("R", (), {"text": factory.texts.pop(0)})()

        return _LLM()


def _phone_rewrite(message, factory):
    return asyncio.run(cctx.contextualize_query(
        message, PHONE_HISTORY[:2], {}, llm_factory=factory, elliptical=True,
        topic=TopicFrame(entities=("Motorola Edge 70 Fusion",), terms=("motorola", "edge", "fusion")),
    ))


def test_rewrite_that_swaps_the_users_value_is_asked_again():
    factory = _SequenceFactory(
        "Is the **Motorola Edge 70 Fusion** available in **Pantone BLUE SURF** color?",
        "Is the **Motorola Edge 70 Fusion** available in red color?",
    )
    out = _phone_rewrite("in red color available?", factory)
    assert out == ("Is the Motorola Edge 70 Fusion available in red color?", False)
    assert len(factory.prompts) == 2 and "left out these words of the user's question: red" in factory.prompts[1]
    assert "stays exactly as the user wrote it" in factory.prompts[0]


def test_rewrite_that_swaps_the_users_number_is_asked_again():
    factory = _SequenceFactory(
        "Is the Motorola Edge 70 Fusion available with 128 GB storage?",
        "Is the Motorola Edge 70 Fusion available with 512 GB storage?",
    )
    out = _phone_rewrite("and the 512 version?", factory)
    assert out == ("Is the Motorola Edge 70 Fusion available with 512 GB storage?", False)
    assert len(factory.prompts) == 2 and "512" in factory.prompts[1].split("left out these words")[1]


def test_rewrite_keeping_the_users_words_needs_one_call():
    factory = _SequenceFactory("Is the Motorola Edge 70 Fusion available in red colors?")
    assert _phone_rewrite("in red color available?", factory)[0] == "Is the Motorola Edge 70 Fusion available in red colors?"
    assert len(factory.prompts) == 1


def test_filler_word_does_not_turn_a_followup_rewrite_into_a_graft():
    factory = _SequenceFactory("What is the warranty of the Motorola Edge 70 Fusion?")
    out = _phone_rewrite("hmm and warranty?", factory)
    assert out == ("What is the warranty of the Motorola Edge 70 Fusion?", False)


def test_rewrite_naming_a_long_product_title_is_kept():
    title = "HP 250 G9 Intel Celeron Dual Core 4500u laptop (8 GB/256 GB SSD/Windows 11 Home)"
    factory = _SequenceFactory(f"What is the RAM configuration of the {title}?")
    assert _phone_rewrite("what about RAM", factory)[0] == f"What is the RAM configuration of the {title}?"
    rambling = _SequenceFactory("x " * 200)
    assert _phone_rewrite("what about RAM", rambling)[0] == "what about RAM"


def test_second_rewrite_is_kept_even_when_it_rephrases_a_comparison():
    factory = _SequenceFactory("Which phone has the lowest price?", "Which phone has the lowest price?")
    assert _phone_rewrite("what about the cheaper one?", factory)[0] == "Which phone has the lowest price?"
    assert len(factory.prompts) == 2


def test_conversational_words_never_become_topic_terms():
    for message in ("okay which one", "are you sure", "okay sure, thanks", "share it please"):
        assert ctm.topic_terms(process_query(message), PROJECT_ID) == []
    assert ctm.topic_terms(process_query("okay which laptop is in red"), PROJECT_ID) == ["laptop"]


@pytest.mark.parametrize(
    "query,expected",
    [
        ("please share me how many color are available", "how many color are available"),
        ("share me the warranty details", "the warranty details"),
        ("can you share the warranty details?", "the warranty details?"),
        ("send me the catalog", "the catalog"),
        ("share price without offer", "share price without offer"),
        ("FUCHS share price", "FUCHS share price"),
        ("shareholder meeting dates", "shareholder meeting dates"),
    ],
)
def test_request_verbs_are_filler_only_in_verb_position(query, expected):
    assert strip_filler(query) == expected
