"""Prompts for the chat query rewriter (``chat_contextualize``)."""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence

from .chat_topic_memory import PendingQuestion, TopicFrame

HISTORY_TURNS = 6

# Follow-ups only (a reply is routed here only when it answers the assistant's question):
# an earlier question the assistant could not answer is closed once the user moves on, and
# service-wide questions do not belong to the product just discussed.
_MOVED_ON_RULES = (
    "- A question the assistant could not answer (it said the information is not available, "
    "or asked back instead of answering) is closed once the user asks something else: never "
    "restate it or merge it into the new question.\n"
    "- A question about terms that apply to the whole business rather than one item (for "
    "example shipping, delivery, returns, refunds, payment, cancellation, coupons, contact or "
    "policies) does not take the product or item from the history, unless the user ties it to "
    "that item ('can I return it?'). Ask it directly. Example: after discussing the Trailpro "
    "hiking boots, 'what about the postage charges' → 'What are the postage charges?' and "
    "'how long till it reaches pune' → 'How long does delivery to Pune take?'\n"
)


def history_text(history: List[Dict[str, str]]) -> str:
    return "\n".join(
        f"{'User' if t['type'] == 'user' else 'Assistant'}: {t['content']}"
        for t in history[-HISTORY_TURNS:]
    )


def _named_items_line(named_items: Sequence[str]) -> str:
    if not named_items:
        return ""
    names = "; ".join(named_items)
    return (
        f"The question names this catalog item: {names}. It now asks about that item by its full "
        "name, instead of the item discussed before; keep what the user asked about the earlier "
        "item when the question names no other detail (after a price question, 'n the X one?' "
        "asks the price of X).\n"
    )


def followup_prompt(
    user_message: str,
    history: List[Dict[str, str]],
    topic: Optional[TopicFrame],
    named_items: Sequence[str] = (),
) -> str:
    topic_line = f"Current conversation topic ({topic.describe()}).\n" if topic and not topic.empty else ""
    ambiguous_rule = (
        "- Respond with exactly one word AMBIGUOUS only if the reply cannot be tied to the "
        "current conversation topic at all. A different size, number or variant the user "
        "names for the same product is never a reason for AMBIGUOUS.\n"
        if topic and not topic.empty
        else "- Only respond with exactly one word AMBIGUOUS if no active entity or group can "
        "be clearly identified from the recent exchange.\n"
    )
    return (
        f"Conversation history:\n{history_text(history)}\n\n{topic_line}"
        "Rewrite the following question as a complete, self-contained question by resolving "
        "ALL references — including pronouns (it/he/she/they) AND vague noun phrases "
        "(e.g. 'the report', 'the law', 'Phase 2', 'that process') — using their actual "
        "referents from the conversation history.\n"
        "Rules:\n"
        "- If the question introduces a NEW topic/subject that is not clearly the same as "
        "what was just discussed, return the question UNCHANGED. Never merge unrelated "
        "prior entities into a new topic (e.g. do not turn an 'online voting' question into "
        "a question about a previously discussed company).\n"
        f"{_MOVED_ON_RULES}"
        "- Comparative or superlative follow-ups ('the cheaper one', 'the other one', "
        "'what about in blue?', 'and the biggest?') keep the SUBJECT and constraints of the "
        "previous question and change only what the user changed. Example: after 'Which "
        "laptop has the highest price?', 'What about the cheaper one?' → 'Which laptop has "
        "the lowest price?'\n"
        "- 'Which one …?' after two items were discussed compares those items by name.\n"
        "- Ordinal references ('the second one', 'the last option') mean the items in the "
        "order the assistant's last response listed them.\n"
        "- Every value the user states (a colour, size, storage, quantity, model or place) stays "
        "exactly as the user wrote it; it replaces the value from the history, never the other "
        "way round. Example: after the assistant described the Blue variant of the Nova X2 "
        "phone, 'in red color available?' → 'Is the Nova X2 phone available in red color?'\n"
        "- Keep numbers, dates, units and the last named entity from the last user and assistant "
        "turns when the follow-up asks for a related fact without restating them. Example: after "
        "the assistant said Chandrayaan-1 launched at 1380 kg, 'what was the mass' → "
        "'What was the launch mass of Chandrayaan-1 (1380 kg)?'\n"
        "- If the user doubts or asks to confirm the last answer ('are you sure?', 'really?', "
        "'is that correct?', 'so it is not available, right?'), restate the user's previous "
        "question as a complete standalone question that names its subject.\n"
        "- Requests for alternatives ('any other brands?', 'what else?', 'more options?') keep "
        "the subject or product category of the previous question and ask for options other "
        "than the ones the assistant already named. Example: after the assistant listed Canon "
        "cameras, 'any other brands available?' → 'Which camera brands other than Canon are "
        "available?'\n"
        "- A bare attribute or condition without a subject ('price without offer', 'how many "
        "colors?', 'in stock?', 'dimensions?') asks for that attribute of the active entity or "
        "product of the last exchange, not about a listed item whose name merely contains the "
        "word. Example: after discussing the Trailpro hiking boots, 'price without offer' → "
        "'What is the regular price of the Trailpro hiking boots without the offer?' This never "
        "applies to the business-wide terms above: 'and the shipping charges?' or 'refund "
        "policy?' after the boots ask about the business, not the boots.\n"
        "- If the pronoun is PLURAL (them/these/those/both) and multiple entities were "
        "recently discussed, include ALL of those entities in the rewritten question. "
        "Example: 'Who operates them?' with Konrad and Morsleben in history → "
        "'Who operates Konrad and Morsleben?'\n"
        "- For singular pronouns (it/its/this/that): identify the ACTIVE ENTITY — the "
        "specific named thing most recently named as the SUBJECT in the assistant's last "
        "response — and rewrite using that entity.\n"
        "- If the user's most recently asked question itself explicitly names a specific "
        "entity, prefer that as the referent.\n"
        f"{ambiguous_rule}"
        "- If the question is already fully self-contained, return it unchanged.\n"
        "- Return only the rewritten question or AMBIGUOUS. No explanations.\n\n"
        f"{_named_items_line(named_items)}"
        f"Question: {user_message}\n"
        "Standalone question:"
    )


def keep_words_note(rewrite: str, dropped: List[str]) -> str:
    return (
        f"\n\nYour previous answer was: {rewrite}\n"
        f"It left out these words of the user's question: {', '.join(dropped)}. Rewrite again and "
        "keep them, unless a word only expressed a comparison the rewrite already states.\n"
        "Standalone question:"
    )


def reply_prompt(user_message: str, history: List[Dict[str, str]], pending: PendingQuestion) -> str:
    return (
        f"Conversation history:\n{history_text(history)}\n\n"
        f"The user originally asked: {pending.original_query}\n"
        f"The assistant then asked the user: {pending.question}\n"
        f"The user replied: {user_message}\n\n"
        "Rewrite the user's ORIGINAL request as one complete, self-contained question that "
        "incorporates what the reply chose or clarified (an option name, 'the second one', "
        "'yes', a brand, a category …).\n"
        "Rules:\n"
        "- When the assistant offered something else ('Would you like details on X instead?') "
        "and the reply accepts it ('yes', 'sure', 'ok show me'), the question is what the "
        "assistant offered: ask about X, not the original request.\n"
        "- Resolve ordinal or partial replies ('the first', 'second one', 'Asus') against the "
        "options or items the assistant offered.\n"
        "- Keep only what the user chose: never include offered options the user did not pick.\n"
        "- If the reply is a follow-up about the same subject (e.g. 'what about the cheaper "
        "one?', 'and in blue?'), rewrite it as a standalone question about that subject.\n"
        "- If the reply is itself a new, unrelated, self-contained question, return the reply "
        "UNCHANGED.\n"
        "- Respond with exactly one word AMBIGUOUS only if the reply still does not say what "
        "the user wants.\n"
        "- Write the question in the language of the user's reply.\n"
        "- Return only the question or AMBIGUOUS. No explanations.\n\n"
        "Standalone question:"
    )
