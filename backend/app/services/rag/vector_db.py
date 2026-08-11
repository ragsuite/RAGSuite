from chromadb.utils import embedding_functions
import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import List, Dict, Any
from ...defaults import DEFAULT_EMBEDDING_MODEL
from ..infra_env import (
    chroma_host,
    chroma_http_enabled,
    chroma_persist_path,
    chroma_port,
    chroma_ssl,
    ollama_base_url,
)


CHROMA_DB_PATH = "../chroma_db"

embedding_function = embedding_functions.OllamaEmbeddingFunction(
    url=ollama_base_url(),
    model_name=DEFAULT_EMBEDDING_MODEL,
)


def _chromadb_http_mode() -> bool:
    return chroma_http_enabled()


def _chromadb_client():
    """Local persistent DB by default; set CHROMA_MODE=http for Docker / multi-container."""
    if chroma_http_enabled():
        host = chroma_host()
        port = chroma_port()
        ssl = chroma_ssl()
        # Explicitly set host/port in Settings to prevent chromadb from reading
        # CHROMA_SERVER_HOST/PORT from the environment (Docker defaults) which
        # would conflict with the local 127.0.0.1 address and raise a ValueError.
        settings = ChromaSettings(chroma_server_host=host, chroma_server_http_port=port)
        return chromadb.HttpClient(host=host, port=port, ssl=ssl, settings=settings)
    persist = chroma_persist_path(CHROMA_DB_PATH) or CHROMA_DB_PATH
    return chromadb.PersistentClient(path=persist)


client = _chromadb_client()

# --- Collection Management ---
def get_or_create_collection(collection_name: str):
    """
    Retrieves a collection if it exists, otherwise creates a new one.
    HttpClient runs in thin mode: do not attach embedding_function (unsupported);
    embeddings are computed locally and sent explicitly.
    """
    if _chromadb_http_mode():
        try:
            collection = client.get_collection(name=collection_name)
        except Exception:
            collection = client.create_collection(name=collection_name)
        return collection
    try:
        collection = client.get_collection(
            name=collection_name,
            embedding_function=embedding_function
        )
    except Exception:
        collection = client.create_collection(
            name=collection_name,
            embedding_function=embedding_function
        )
    return collection

# --- Document Operations ---
def add_documents_to_collection(
    collection,
    documents: List[str],
    metadatas: List[Dict[str, Any]],
    ids: List[str]
):
    """
    Adds new documents with their metadata and unique IDs to the ChromaDB collection.
    """
    if _chromadb_http_mode():
        embeddings = embedding_function.embed_documents(documents)
        collection.add(
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        return
    collection.add(
        documents=documents,
        metadatas=metadatas,
        ids=ids
    )

def query_collection(
    collection,
    query_texts: List[str],
    n_results: int = 5
) -> Dict:
    """
    Performs a similarity search on the collection with the given query texts.
    Returns the most relevant documents.
    """
    if _chromadb_http_mode():
        query_embeddings = embedding_function.embed_documents(query_texts)
        results = collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results
        )
        return results
    results = collection.query(
        query_texts=query_texts,
        n_results=n_results
    )
    return results
