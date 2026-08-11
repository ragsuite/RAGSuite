"""RAG context redaction: preserve public contact numbers."""
from app.services.rag.rag import RAG


class _StubRetriever:
    default_top_k = 5


def test_public_phone_numbers_are_not_redacted():
    rag = RAG(retriever=_StubRetriever(), llm_model="stub")
    text = "Kontakt: 0531-699-2200 oder 0531.699-2200, Tel. 05316992200"
    result = rag._redact_sensitive_text(text)
    assert "[REDACTED_PHONE]" not in result
    assert "0531-699-2200" in result
    assert "05316992200" in result


def test_public_emails_are_not_redacted():
    rag = RAG(retriever=_StubRetriever(), llm_model="stub")
    text = "E-Mail: sekretariat-heller@heh-bs.de, ambulanz-orthopaedie@heh-bs.de"
    result = rag._redact_sensitive_text(text)
    assert "[REDACTED_EMAIL]" not in result
    assert "sekretariat-heller@heh-bs.de" in result
    assert "ambulanz-orthopaedie@heh-bs.de" in result


def test_financial_identifiers_still_redacted():
    rag = RAG(retriever=_StubRetriever(), llm_model="stub")
    text = "PAN ABCDE1234F, Aadhaar 1234 5678 9012"
    result = rag._redact_sensitive_text(text)
    assert "[REDACTED_PAN]" in result
    assert "[REDACTED_AADHAAR]" in result
    assert "ABCDE1234F" not in result
