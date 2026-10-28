from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.extra_model_runtime import (
    _scores_from_ranked_results,
    extra_rerank_scores,
    provider_from_collection,
    resolve_extra_model,
)
from app.services.provider_factories import merge_model_ids
from app.services.rag.pdf_page_extract import OCR_MODEL_KEY, ingest_kwargs_from_document, meta_for_upload


def test_merge_live_models_keeps_saved_selection():
    merged = merge_model_ids(["gpt-4o"], ["gpt-4.1"], ["saved-custom"])
    assert merged[0] == "gpt-4o"
    assert "saved-custom" in merged
    assert merged.count("gpt-4o") == 1


def test_empty_extra_model_is_native(monkeypatch):
    monkeypatch.setattr(
        "app.services.extra_model_runtime.get_provider_config",
        lambda *_a, **_k: SimpleNamespace(asr_model="", tts_model=None, rerank_model="  ", provider="openai"),
    )
    db = MagicMock()
    pid = "11111111-1111-1111-1111-111111111111"
    assert resolve_extra_model(db, pid, "asr", "openai") is None
    assert extra_rerank_scores(None, None, "q", ["a"]) is None


def test_provider_from_collection_picks_matching_key():
    assert provider_from_collection("proj_openai_embed", ["anthropic", "openai"]) == "openai"
    assert provider_from_collection("other", ["openai"]) is None


def test_ocr_meta_enables_docling():
    meta = meta_for_upload(
        page_from=None,
        page_to=None,
        strip_chrome=True,
        filename="scan.pdf",
        ocr_model="openai:gpt-4o",
    )
    assert meta[OCR_MODEL_KEY] == "openai:gpt-4o"
    kwargs = ingest_kwargs_from_document(SimpleNamespace(meta_data=meta))
    assert kwargs["ocr_model"] == "openai:gpt-4o"
    assert kwargs["extract_engine"] == "docling"


def test_ranked_results_fill_score_order():
    assert _scores_from_ranked_results(
        [{"index": 1, "relevance_score": 0.9}, {"index": 0, "score": 0.1}],
        2,
    ) == [0.1, 0.9]


def test_empty_ocr_stays_native():
    meta = meta_for_upload(
        page_from=None, page_to=None, strip_chrome=True, filename="scan.pdf", ocr_model=""
    )
    assert OCR_MODEL_KEY not in meta
    kwargs = ingest_kwargs_from_document(SimpleNamespace(meta_data=meta))
    assert "ocr_model" not in kwargs


def _speech_rows():
    return {
        "mistral": SimpleNamespace(
            asr_model="",
            tts_model=None,
            rerank_model="mistral-rerank",
            ocr_model="",
            provider="mistral",
            api_key="msk",
        ),
        "openai": SimpleNamespace(
            asr_model="whisper-1",
            tts_model="tts-1",
            rerank_model="",
            ocr_model="",
            provider="openai",
            api_key="osk",
        ),
    }


def test_speech_falls_back_to_configured_provider(monkeypatch):
    rows = _speech_rows()
    monkeypatch.setattr(
        "app.services.extra_model_runtime.get_provider_config",
        lambda _db, _pid, provider: rows.get(provider),
    )
    monkeypatch.setattr(
        "app.services.extra_model_runtime.resolve_provider_endpoint",
        lambda *_a, **_k: "https://api.openai.com/v1",
    )
    db = MagicMock()
    pid = "11111111-1111-1111-1111-111111111111"

    asr = resolve_extra_model(db, pid, "asr", "mistral")
    assert asr is not None
    assert asr.provider == "openai"
    assert asr.model == "whisper-1"

    tts = resolve_extra_model(db, pid, "tts", None)
    assert tts is not None
    assert tts.provider == "openai"
    assert tts.model == "tts-1"


def test_rerank_stays_preferred_only(monkeypatch):
    rows = _speech_rows()
    monkeypatch.setattr(
        "app.services.extra_model_runtime.get_provider_config",
        lambda _db, _pid, provider: rows.get(provider),
    )
    monkeypatch.setattr(
        "app.services.extra_model_runtime.resolve_provider_endpoint",
        lambda *_a, **_k: "https://api.mistral.ai",
    )
    db = MagicMock()
    pid = "11111111-1111-1111-1111-111111111111"

    rerank = resolve_extra_model(db, pid, "rerank", "mistral")
    assert rerank is not None
    assert rerank.provider == "mistral"
    assert rerank.model == "mistral-rerank"
    assert resolve_extra_model(db, pid, "rerank", "openai") is None
    assert resolve_extra_model(db, pid, "rerank", None) is None
