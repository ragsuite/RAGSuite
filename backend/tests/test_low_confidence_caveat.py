"""The low-confidence caveat marks incomplete answers, never refusals."""
from app.routes.rag import RAG_OOC_SENTINEL, _wrap_low_confidence_answer

CAVEAT = "**Note:** I have only limited details on this"
OOC_REPLY = "I am sorry, this query is out of the context of the provided documents."


def test_weak_answer_gets_caveat():
    wrapped = _wrap_low_confidence_answer("The Edge 70 Max costs ₹59,999.", "", {"fused_count": 4})
    assert wrapped.startswith(CAVEAT)


def test_out_of_context_reply_gets_no_caveat():
    assert _wrap_low_confidence_answer(OOC_REPLY, "", {"fused_count": 4}) == OOC_REPLY


def test_sentinel_reply_gets_no_caveat():
    custom = "Please contact our support team."
    assert _wrap_low_confidence_answer(custom, RAG_OOC_SENTINEL, None) == custom


def test_reply_without_retrieved_passages_gets_no_caveat():
    custom = "Please contact our support team."
    assert _wrap_low_confidence_answer(custom, "", {"fused_count": 0}) == custom


def test_answer_already_hedged_is_unchanged():
    hedged = "I am not sure the documents cover this."
    assert _wrap_low_confidence_answer(hedged) == hedged
