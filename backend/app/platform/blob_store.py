"""MinIO object store for uploaded / connector file bytes.

Postgres keeps metadata only. Keys are ``{project_id}/{document_id}/{filename}``.
"""
from __future__ import annotations

import io
import logging
import threading
from pathlib import Path

from .settings import settings

logger = logging.getLogger(__name__)

_client = None
_lock = threading.Lock()
_bucket_ready = False


def blob_key(project_id: object, document_id: object, filename: str) -> str:
    safe = Path(str(filename or "blob")).name or "blob"
    return f"{project_id}/{document_id}/{safe}"


def configured() -> bool:
    return bool((settings.minio_endpoint or "").strip())


def get_client():
    global _client, _bucket_ready
    if _client is not None and _bucket_ready:
        return _client
    if not configured():
        raise RuntimeError("MINIO_ENDPOINT is not set")
    with _lock:
        if _client is None:
            endpoint = settings.minio_endpoint.strip()
            if "://" in endpoint:
                endpoint = endpoint.split("://", 1)[1]
            from minio import Minio

            _client = Minio(
                endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=bool(settings.minio_secure),
                region=settings.minio_region or None,
            )
        if not _bucket_ready:
            bucket = settings.minio_bucket
            if not _client.bucket_exists(bucket):
                _client.make_bucket(bucket)
            _bucket_ready = True
        return _client


def put(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    client = get_client()
    payload = data if isinstance(data, (bytes, bytearray)) else bytes(data)
    client.put_object(
        settings.minio_bucket,
        key,
        io.BytesIO(payload),
        length=len(payload),
        content_type=content_type,
    )
    return key


def get(key: str) -> bytes:
    client = get_client()
    response = client.get_object(settings.minio_bucket, key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def exists(key: str) -> bool:
    from minio.error import S3Error

    client = get_client()
    try:
        client.stat_object(settings.minio_bucket, key)
        return True
    except S3Error as exc:
        if exc.code in {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}:
            return False
        raise


def delete(key: str) -> None:
    from minio.error import S3Error

    client = get_client()
    try:
        client.remove_object(settings.minio_bucket, key)
    except S3Error as exc:
        if exc.code in {"NoSuchKey", "NoSuchObject"}:
            return
        raise


def health() -> dict:
    if not configured():
        return {"healthy": False, "message": "MINIO_ENDPOINT is not set"}
    try:
        client = get_client()
        client.bucket_exists(settings.minio_bucket)
        return {"healthy": True, "bucket": settings.minio_bucket, "endpoint": settings.minio_endpoint}
    except Exception as exc:
        logger.warning("MinIO health failed: %s", exc)
        return {"healthy": False, "message": str(exc)}
