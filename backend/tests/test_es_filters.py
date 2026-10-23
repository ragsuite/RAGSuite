from app.services.rag.vector_store.es_filters import to_es_query


def test_empty_where_is_match_all():
    assert to_es_query(None) == {"match_all": {}}
    assert to_es_query({}) == {"match_all": {}}


def test_equality_and_nin():
    assert to_es_query({"document_id": "abc"}) == {"term": {"document_id": "abc"}}
    q = to_es_query({"document_id": {"$nin": ["a", "b"]}})
    assert q == {"bool": {"must_not": [{"terms": {"document_id": ["a", "b"]}}]}}


def test_and_project_and_source():
    q = to_es_query({"$and": [{"project_id": "p1"}, {"source_file": "a.pdf"}]})
    assert q["bool"]["must"][0] == {"term": {"project_id": "p1"}}
    assert q["bool"]["must"][1] == {"term": {"source_file": "a.pdf"}}
