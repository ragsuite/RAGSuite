"""
Documents API routes - Document management endpoints
"""
import uuid
import hashlib
import os
import io
import mimetypes
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Request, Query, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer
from sqlalchemy import and_
import logging

# Import RAG pipeline and database models (now merged into app)
try:
    from app.services.rag.rag import RAGPipeline, logger
    from app.models import UploadedDocument, Project
    RAG_AVAILABLE = True
except ImportError as e:
    logging.warning(f"RAG components not available: {e}")
    RAG_AVAILABLE = False
    logger = logging.getLogger(__name__)

from app.db import get_db


def _content_disposition(disposition: str, filename: str) -> str:
    """Build a latin-1-safe Content-Disposition value (RFC 5987 for Unicode names)."""
    safe_name = (filename or "document").replace('"', "'").replace("\r", "").replace("\n", "")
    ascii_fallback = safe_name.encode("ascii", "ignore").decode() or "document"
    encoded = quote(safe_name, safe="")
    return f'{disposition}; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'


_INLINE_PREVIEW_MIME_PREFIXES = (
    "application/pdf",
    "text/",
    "image/",
)


def _stream_disposition_for_media(media_type: str) -> str:
    """Browsers can preview PDF/text/images inline; office docs should download."""
    mt = (media_type or "").split(";")[0].strip().lower()
    if any(mt.startswith(prefix) for prefix in _INLINE_PREVIEW_MIME_PREFIXES):
        return "inline"
    return "attachment"


def _resolve_uploaded_document_bytes(db: Session, doc: "UploadedDocument") -> bytes:
    """Return file bytes from DB, or recover from connector staging path when empty."""
    raw = doc.text_content or b""
    if isinstance(raw, memoryview):
        raw = raw.tobytes()
    content = bytes(raw)
    if content:
        return content

    try:
        from app.models import ConnectorDocument

        link = (
            db.query(ConnectorDocument)
            .filter(ConnectorDocument.document_id == doc.id)
            .first()
        )
        staging = (link.staging_path if link else None) or None
        if staging and os.path.isfile(staging):
            with open(staging, "rb") as fh:
                recovered = fh.read()
            if recovered:
                doc.text_content = recovered
                db.commit()
                return recovered
    except Exception as exc:
        logger.warning("Could not recover document bytes for %s: %s", doc.id, exc)
    return b""


_SHORT_TYPE_TO_MIME = {
    "txt": "text/plain",
    "text": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
    "html": "text/html",
    "htm": "text/html",
    "csv": "text/csv",
    "json": "application/json",
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def _document_media_type(doc_type: Optional[str]) -> str:
    """Normalize stored short types (e.g. Gmail historically wrote ``txt``) to real MIME."""
    t = (doc_type or "").strip().lower()
    if not t:
        return "application/octet-stream"
    if "/" in t:
        return t
    return _SHORT_TYPE_TO_MIME.get(t, "application/octet-stream")


from app.auth import get_current_user_required, get_active_project, get_project_id_or_user
from app.models import User, Project
from app.services.notification_service import create_notification
from app.services.audit_service import emit_audit
from app.services.db_vector_consistency import (
    compensate_uploaded_document_on_db_failure,
    purge_uploaded_document_after_db_delete,
)
from app.settings import settings

# Create documents router
router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])

# Pipeline resolved via singleton on each request — no module-level instance

max_file_size = 50 * 1024 * 1024  # 50MB
MAX_ZIP_SIZE = 200 * 1024 * 1024  # 200MB
MAX_ZIP_EXTRACTED_BYTES = 500 * 1024 * 1024  # 500MB
MAX_ZIP_FILE_COUNT = 500
SUPPORTED_UPLOAD_EXTENSIONS = {
    ".txt", ".md", ".pdf", ".doc", ".docx", ".rtf",
    ".csv", ".tsv", ".json", ".xml", ".html", ".htm",
    ".ppt", ".pptx", ".xls", ".xlsx"
}

# --- Pydantic Models ---
class DocumentDetails(BaseModel):
    id: str
    title: str
    description: Optional[str]
    type: str
    source: str
    language: str
    status: str
    chunks: int
    lastIndexed: datetime
    url: str
    checksum: str
    size: str


class DocumentMetadataUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    source: Optional[str] = None
    language: Optional[str] = None
    status: Optional[str] = None
    chunks: Optional[int] = None
    url: Optional[str] = None
    checksum: Optional[str] = None
    size_kb: Optional[int] = None


class DocumentUploadResponse(BaseModel):
    id: str
    message: str = "Document uploaded successfully."
    status: Optional[str] = None


# --- Helper Functions ---
async def process_uploaded_file(
        file: UploadFile,
        title: Optional[str],
        description: Optional[str],
        language: str,
        source: Optional[str],
) -> dict:
    """Process uploaded file and return metadata."""
    content = await file.read()
    
    if len(content) > max_file_size:
        raise HTTPException(status_code=400, detail=f"File size ({len(content)} bytes) exceeds the maximum allowed limit of 50MB.")
    
    size_kb = round(len(content) / 1024)
    checksum = hashlib.sha256(content).hexdigest()[:12]
    doc_id = str(uuid.uuid4())

    file_type = file.content_type or ""
    if not file_type or file_type in ("application/octet-stream", "Unknown"):
        guessed, _ = mimetypes.guess_type(file.filename or "")
        file_type = guessed or file_type or "application/octet-stream"
    if len(file_type) > 50:
        if "/" in file_type:
            main_type = file_type.split("/")[0]
            extension = file.filename.split(".")[-1].upper() if file.filename and "." in file.filename else "FILE"
            file_type = f"{main_type}/{extension}"
        else:
            file_type = file_type[:50]

    return {
        "id": doc_id,
        "title": title or file.filename,
        "description": description,
        "text_content": content,
        "type": file_type,
        "source": source or "Unknown",
        "language": language,
        "status": "Indexed",
        "chunks": 0,
        "checksum": checksum,
        "size_kb": size_kb,
        "indexed_at": datetime.utcnow(),
    }


def _normalize_upload_filename(filename: Optional[str]) -> str:
    """Return a safe filename without directory traversal or separators."""
    if not filename:
        return "uploaded_file"
    safe_name = Path(filename).name.replace("\x00", "")
    return safe_name or "uploaded_file"


def _is_zip_file(filename: Optional[str], content_type: Optional[str]) -> bool:
    file_ext = Path(filename or "").suffix.lower()
    if file_ext == ".zip":
        return True
    return (content_type or "").lower() in {"application/zip", "application/x-zip-compressed"}


def _collect_files_from_zip(zip_content: bytes, zip_name: str) -> Tuple[List[Tuple[str, bytes, str]], List[str]]:
    """
    Parse zip bytes and return valid files as tuples of (filename, content, content_type).
    Also returns a list of skipped file messages for observability.
    """
    extracted_files: List[Tuple[str, bytes, str]] = []
    skipped: List[str] = []

    if len(zip_content) > MAX_ZIP_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"ZIP file '{zip_name}' exceeds maximum allowed size of {MAX_ZIP_SIZE // (1024 * 1024)}MB.",
        )

    try:
        with zipfile.ZipFile(io.BytesIO(zip_content)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ZIP_FILE_COUNT:
                raise HTTPException(
                    status_code=400,
                    detail=f"ZIP file '{zip_name}' contains too many entries (>{MAX_ZIP_FILE_COUNT}).",
                )

            total_uncompressed = 0
            for info in infos:
                if info.is_dir():
                    continue

                normalized_path = Path(info.filename)
                if normalized_path.is_absolute() or ".." in normalized_path.parts:
                    skipped.append(f"{info.filename}: blocked unsafe path")
                    continue

                # Block symlinks (Unix mode 0xA000) — prevents escaping extraction dir
                if (info.external_attr >> 16) & 0xFFFF == 0xA1ED:
                    skipped.append(f"{info.filename}: symlinks not allowed")
                    continue

                file_name = _normalize_upload_filename(info.filename)
                ext = Path(file_name).suffix.lower()
                if ext == ".zip":
                    skipped.append(f"{info.filename}: nested zip archives are not supported")
                    continue
                if ext not in SUPPORTED_UPLOAD_EXTENSIONS:
                    skipped.append(f"{info.filename}: unsupported file extension '{ext or 'none'}'")
                    continue

                if info.file_size > max_file_size:
                    skipped.append(f"{info.filename}: file exceeds {max_file_size // (1024 * 1024)}MB limit")
                    continue

                total_uncompressed += info.file_size
                if total_uncompressed > MAX_ZIP_EXTRACTED_BYTES:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"ZIP file '{zip_name}' exceeds total extracted size limit of "
                            f"{MAX_ZIP_EXTRACTED_BYTES // (1024 * 1024)}MB."
                        ),
                    )

                content = archive.read(info)
                content_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
                extracted_files.append((file_name, content, content_type))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail=f"'{zip_name}' is not a valid ZIP archive.")

    return extracted_files, skipped


def _build_doc_data_from_content(
    file_name: str,
    content: bytes,
    content_type: Optional[str],
    title: Optional[str],
    description: Optional[str],
    language: str,
    source: Optional[str],
) -> dict:
    if len(content) > max_file_size:
        raise HTTPException(
            status_code=400,
            detail=f"File '{file_name}' exceeds the maximum allowed limit of 50MB.",
        )

    size_kb = round(len(content) / 1024)
    checksum = hashlib.sha256(content).hexdigest()[:12]
    doc_id = str(uuid.uuid4())

    file_type = content_type or ""
    if not file_type or file_type in ("application/octet-stream", "Unknown"):
        guessed, _ = mimetypes.guess_type(file_name)
        file_type = guessed or file_type or "application/octet-stream"
    if len(file_type) > 50:
        if "/" in file_type:
            main_type = file_type.split("/")[0]
            extension = file_name.split(".")[-1].upper() if "." in file_name else "FILE"
            file_type = f"{main_type}/{extension}"
        else:
            file_type = file_type[:50]

    return {
        "id": doc_id,
        "title": title or file_name,
        "description": description,
        "text_content": content,
        "type": file_type,
        "source": source or "Unknown",
        "language": language,
        "status": "Indexed",
        "chunks": 0,
        "checksum": checksum,
        "size_kb": size_kb,
        "indexed_at": datetime.utcnow(),
    }


# --- API Endpoints ---
@router.get("", response_model=List[DocumentDetails], summary="List indexed documents")
def get_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    """Get all indexed documents for the active project - shows ALL historical documents for this project"""
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="Documents API not available - RAG components not loaded")
    
    # Filter documents by user AND active project - shows ALL historical documents.
    # Defer text_content: list response never needs binary blobs (avoids loading full PDF bytes).
    docs = db.query(UploadedDocument).options(
        defer(UploadedDocument.text_content)
    ).filter(
        and_(
            UploadedDocument.user_id == current_user.id,
            UploadedDocument.project_id == active_project.id
        )
    ).order_by(UploadedDocument.indexed_at.desc()).all()

    return [
        DocumentDetails(
            id=str(d.id),
            title=d.title,
            description=d.description,
            type=d.type or "Unknown",
            source=d.source or "Unknown",
            language=d.language or "Unknown",
            status=d.status or "Indexed",
            chunks=d.chunks or 0,
            lastIndexed=d.indexed_at,
            url=d.url or "",
            checksum=d.checksum or "",
            size=f"{d.size_kb or 0} KB",
        )
        for d in docs
    ]


@router.post("/upload", response_model=List[DocumentUploadResponse], summary="Upload document manually")
async def upload_document(
    request: Request,
    files: List[UploadFile] = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    language: str = Form("English"),
    source: Optional[str] = Form(None),
    project_id: Optional[uuid.UUID] = Form(
        None,
        description="Optional project UUID. Leave empty to use the active/default project.",
        json_schema_extra={"example": None},
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Upload and index documents manually"""
    from app.services.rag.singleton import get_pipeline

    rag_pipeline = get_pipeline()
    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(status_code=503, detail="Documents API not available - RAG pipeline not initialized")
    
    # Get project_id - use provided or get active project
    from app.models import Project
    from sqlalchemy import and_
    
    if not project_id:
        # Try to get active project
        active_project = db.query(Project).filter(
            and_(
                Project.owner_id == current_user.id,
                Project.is_active == True
            )
        ).first()
        
        # If no active project, check if user has any projects
        if not active_project:
            any_project = db.query(Project).filter(
                Project.owner_id == current_user.id
            ).first()
            
            # If user has projects but none are active, activate the first one
            if any_project:
                any_project.is_active = True
                db.commit()
                db.refresh(any_project)
                project_id = any_project.id
            else:
                # Strict single-project mode: never auto-create fallback projects.
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No project found. Please create a project first."
                )
        else:
            project_id = active_project.id
    else:
        # Verify project belongs to user
        project = db.query(Project).filter(
            and_(
                Project.id == project_id,
                Project.owner_id == current_user.id
            )
        ).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
    
    from app.services.document_ingest_orchestration import (
        ingest_document_inline,
        queue_document_ingest,
        staging_path_for_document,
        use_async_document_ingest,
    )

    async_ingest = use_async_document_ingest()
    os.makedirs("data/tmp", exist_ok=True)
    if async_ingest:
        os.makedirs(settings.document_staging_dir or "data/staging", exist_ok=True)

    # Queue depth caps — prevent runaway queuing without rejecting legitimate bulk imports
    if async_ingest:
        from app.services.job_queue import (
            count_active_ingest_for_project,
            count_pending_jobs_for_user,
            get_org_cap,
        )
        _MAX_QUEUED_INGEST_JOBS = 200
        _active_jobs = count_pending_jobs_for_user(db, current_user.id)
        if _active_jobs >= _MAX_QUEUED_INGEST_JOBS:
            raise HTTPException(
                status_code=429,
                detail=f"Upload queue full ({_active_jobs} jobs pending/running). Wait for existing jobs to finish before uploading more.",
            )
        _proj_cap = get_org_cap(
            db,
            current_user.id,
            "max_queued_ingest_per_project",
            int(settings.max_queued_ingest_per_project or 0),
        )
        if _proj_cap > 0 and project_id is not None:
            _proj_active = count_active_ingest_for_project(db, project_id)
            if _proj_active >= _proj_cap:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"Project upload queue full ({_proj_active} jobs pending/running for this project). "
                        "Wait for existing jobs to finish before uploading more."
                    ),
                )

    responses = []

    for file in files:
        save_path = None
        keep_staging_file = False
        try:
            upload_content = await file.read()
            upload_name = _normalize_upload_filename(file.filename)

            files_to_ingest: List[Tuple[str, bytes, str]] = []
            if _is_zip_file(upload_name, file.content_type):
                extracted_files, skipped_messages = _collect_files_from_zip(upload_content, upload_name)
                for skipped_msg in skipped_messages:
                    logger.warning(f"ZIP skipped entry: {skipped_msg}")
                files_to_ingest.extend(extracted_files)
                if not files_to_ingest:
                    raise HTTPException(
                        status_code=400,
                        detail=f"No supported files were found inside ZIP archive '{upload_name}'.",
                    )
            else:
                files_to_ingest.append((upload_name, upload_content, file.content_type or "application/octet-stream"))

            for entry_name, entry_content, entry_type in files_to_ingest:
                doc_data = _build_doc_data_from_content(
                    file_name=entry_name,
                    content=entry_content,
                    content_type=entry_type,
                    title=title,
                    description=description,
                    language=language,
                    source=source,
                )
                doc_uuid = uuid.UUID(doc_data["id"])
                if async_ingest:
                    save_path = staging_path_for_document(doc_data["id"], entry_name)
                else:
                    save_path = f"data/tmp/{doc_data['id']}_{entry_name}"

                with open(save_path, "wb") as f:
                    f.write(doc_data["text_content"])

                document = UploadedDocument(
                    id=doc_uuid,
                    user_id=current_user.id,
                    project_id=project_id,
                    title=doc_data["title"],
                    description=doc_data["description"],
                    text_content=doc_data["text_content"],
                    type=doc_data["type"],
                    source=doc_data["source"],
                    language=doc_data["language"],
                    status="Queued",
                    chunks=0,
                    checksum=doc_data["checksum"],
                    size_kb=doc_data["size_kb"],
                    indexed_at=doc_data["indexed_at"],
                )
                db.add(document)
                db.commit()
                db.refresh(document)

                if async_ingest:
                    ingest_result = queue_document_ingest(
                        db,
                        document_id=doc_uuid,
                        staging_path=save_path,
                        user_id=current_user.id,
                        project_id=project_id,
                        title=doc_data["title"],
                    )
                    doc_status = ingest_result.doc_status
                    chunks_count = ingest_result.chunks_count
                    keep_staging_file = True
                    save_path = None
                    response_message = ingest_result.message
                else:
                    doc_status, chunks_count = await ingest_document_inline(
                        db,
                        save_path=save_path,
                        document_id=doc_data["id"],
                        user_id=current_user.id,
                        project_id=project_id,
                    )
                    if chunks_count == 0 and doc_status == "Indexed":
                        doc_status = "No Text Extracted"
                    elif chunks_count > 0:
                        logger.info(
                            "Ingestion successful: %s chunks created for %s",
                            chunks_count,
                            entry_name,
                        )

                    document.status = doc_status
                    document.chunks = chunks_count
                    if doc_status == "Indexed" and chunks_count > 0:
                        document.indexed_at = datetime.utcnow()
                    try:
                        db.commit()
                    except Exception:
                        db.rollback()
                        compensate_uploaded_document_on_db_failure(doc_data["id"])
                        raise
                    db.refresh(document)

                    try:
                        if doc_status == "Indexed" and chunks_count > 0:
                            create_notification(
                                db=db,
                                user_id=current_user.id,
                                title="Document Uploaded",
                                message=(
                                    f"Document '{doc_data['title']}' has been uploaded and "
                                    f"indexed successfully with {chunks_count} chunks."
                                ),
                                type="success",
                                action_url="/documents",
                            )
                        elif doc_status in {
                            "Indexing Failed",
                            "No Text Extracted",
                            "Indexing Timed Out",
                        }:
                            create_notification(
                                db=db,
                                user_id=current_user.id,
                                title="Document Upload Failed",
                                message=(
                                    f"Document '{doc_data['title']}' was uploaded but indexing "
                                    f"failed. Status: {doc_status}"
                                ),
                                type="error",
                                action_url="/documents",
                            )
                    except Exception as notif_error:
                        logger.warning(
                            "Failed to create document upload notification: %s",
                            notif_error,
                        )
                    response_message = f"Document uploaded and status: {doc_status}"

                emit_audit(
                    event_type="document.uploaded",
                    request=request,
                    user_id=current_user.id,
                    project_id=project_id,
                    resource_type="document",
                    resource_id=str(document.id),
                    summary=f"Document uploaded: {doc_data['title']}",
                    details={"status": doc_status, "chunks": chunks_count},
                )

                responses.append(
                    DocumentUploadResponse(
                        id=str(document.id),
                        message=response_message,
                        status=doc_status,
                    )
                )

                if not keep_staging_file and save_path and os.path.exists(save_path):
                    os.remove(save_path)
                    save_path = None

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Global upload error for file {file.filename}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload document: {str(e)}"
            )
        finally:
            if not keep_staging_file and save_path and os.path.exists(save_path):
                os.remove(save_path)

    return responses


@router.put("/{id}", response_model=DocumentDetails, summary="Update document metadata")
def update_document(
    id: str,
    update_data: DocumentMetadataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Update document metadata"""
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="Documents API not available - RAG components not loaded")
    
    doc = db.query(UploadedDocument).filter(
        UploadedDocument.id == uuid.UUID(id),
        UploadedDocument.user_id == current_user.id,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    for field, value in update_data.dict(exclude_unset=True).items():
        if hasattr(doc, field):
            setattr(doc, field, value)

    db.commit()
    db.refresh(doc)

    return DocumentDetails(
        id=str(doc.id),
        title=doc.title,
        description=doc.description,
        type=doc.type or "Unknown",
        source=doc.source or "Unknown",
        language=doc.language or "Unknown",
        status=doc.status or "Unknown",
        chunks=doc.chunks or 0,
        lastIndexed=doc.indexed_at,
        url=doc.url or "",
        checksum=doc.checksum or "",
        size=f"{doc.size_kb or 0} KB",
    )


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove document from index")
def delete_document(
    id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Delete a document from the index - removes from both ChromaDB and PostgreSQL"""
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="Documents API not available - RAG components not loaded")
    
    doc = db.query(UploadedDocument).filter(
        UploadedDocument.id == uuid.UUID(id),
        UploadedDocument.user_id == current_user.id,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc_id = doc.id
    doc_project_id = doc.project_id
    doc_title = doc.title

    # Delete staging file before touching DB — worker checks existence before ingest,
    # so removing it here prevents a running ingest from re-recovering from text_content.
    import glob as _glob
    import os as _os
    _staging_dir = settings.document_staging_dir
    for _f in _glob.glob(_os.path.join(_staging_dir, f"{doc_id}_*")):
        try:
            _os.remove(_f)
            logger.info("Deleted staging file %s for document %s", _f, doc_id)
        except OSError as _e:
            logger.warning("Could not delete staging file %s: %s", _f, _e)

    # Cancel active ingest job before deleting so the worker doesn't keep
    # processing a document that no longer exists in the DB.
    from app.models import BackgroundJob, BackgroundJobStatus, BackgroundJobType
    from app.services.job_queue import INGEST_TRANSITIONAL_STATUSES
    if doc.status in INGEST_TRANSITIONAL_STATUSES:
        active_bg = db.query(BackgroundJob).filter(
            BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
            BackgroundJob.status.in_([BackgroundJobStatus.PENDING.value, BackgroundJobStatus.RUNNING.value]),
            BackgroundJob.payload["document_id"].as_string() == str(doc_id),
        ).first()
        if active_bg:
            active_bg.status = BackgroundJobStatus.FAILED.value
            active_bg.error = "Cancelled: document deleted by user"
            db.commit()
            logger.info("Cancelled active ingest job for document %s before deletion", doc_id)

    # Consistency-first ordering: delete relational row first.
    db.delete(doc)
    db.commit()
    logger.info(f"✅ Deleted document {doc_id} from PostgreSQL")

    # Drop caches immediately so Compare/Chat ignore this id while vectors purge.
    if doc_project_id is not None:
        try:
            from app.services.reindex_service import invalidate_item_embedding_coverage_cache

            invalidate_item_embedding_coverage_cache(str(doc_project_id))
        except Exception as cache_exc:
            logger.warning(
                "Coverage cache invalidate after document delete failed for %s: %s",
                doc_id,
                cache_exc,
            )
    try:
        from app.services.rag.singleton import get_pipeline

        p = get_pipeline()
        if p is not None:
            p.clear_query_cache()
    except Exception as cache_exc:
        logger.warning(
            "Query cache clear after document delete failed for %s: %s",
            doc_id,
            cache_exc,
        )

    # Vector purge after commit — do not block the HTTP response.
    doc_id_str = str(doc_id)

    def _purge_document_vectors() -> None:
        try:
            ok = purge_uploaded_document_after_db_delete(doc_id_str)
            if not ok:
                logger.warning("Chroma deletion may be incomplete for document %s", doc_id_str)
        except Exception as e:
            logger.error("Error deleting ChromaDB embeddings for document %s: %s", doc_id_str, e)

    background_tasks.add_task(_purge_document_vectors)

    emit_audit(
        event_type="document.deleted",
        request=request,
        user_id=current_user.id,
        project_id=doc_project_id,
        resource_type="document",
        resource_id=str(doc_id),
        summary=f"Document deleted: {doc_title}",
        background_tasks=background_tasks,
    )

    return


@router.get("/{id}/content", summary="Retrieve document content")
def get_document_content(
    id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """
    Get document content as file download.

    Supports:
    - user JWT auth
    - project-scoped widget auth (X-Project-ID + domain validation)
    - project-scoped API key auth
    """
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="Documents API not available - RAG components not loaded")

    try:
        doc_id = uuid.UUID(id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")

    query = db.query(UploadedDocument).filter(UploadedDocument.id == doc_id)

    auth_type = auth.get("type")
    if auth_type == "widget":
        project_id = auth.get("project_id")
        user_id = auth.get("user_id")
        query = query.filter(
            UploadedDocument.project_id == project_id,
            and_(
                UploadedDocument.user_id == user_id,
            ) | (UploadedDocument.user_id.is_(None)),
        )
    elif auth_type == "api_key":
        api_key = auth.get("api_key")
        key_project_id = getattr(api_key, "project_id", None) if api_key else None
        key_user_id = auth.get("user_id")
        if not key_project_id:
            raise HTTPException(status_code=403, detail="API key must be project-scoped for document content")
        query = query.filter(
            UploadedDocument.project_id == key_project_id,
            and_(
                UploadedDocument.user_id == key_user_id,
            ) | (UploadedDocument.user_id.is_(None)),
        )
    elif auth_type == "user":
        user = auth.get("user")
        query = query.filter(UploadedDocument.user_id == user.id)
    else:
        raise HTTPException(status_code=401, detail="Authentication required")

    doc = query.first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    content_bytes = _resolve_uploaded_document_bytes(db, doc)
    if not content_bytes:
        raise HTTPException(status_code=404, detail="Document content not available.")

    media_type = _document_media_type(doc.type)
    return StreamingResponse(
        io.BytesIO(content_bytes),
        media_type=media_type,
        headers={
            "Content-Disposition": _content_disposition(
                _stream_disposition_for_media(media_type),
                doc.title,
            )
        },
    )


class ChunkItem(BaseModel):
    chunk_index: int
    text: str
    metadata: dict


class DocumentChunksResponse(BaseModel):
    chunks: List[ChunkItem]
    total: int
    has_more: bool


@router.get("/{id}/chunks", response_model=DocumentChunksResponse, summary="Get document chunks")
def get_document_chunks(
    id: str,
    limit: int = Query(default=30, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    """Return paginated vector chunks for a document, sorted by chunk_index."""
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="Documents API not available - RAG components not loaded")

    try:
        doc_id = uuid.UUID(id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")

    doc = db.query(UploadedDocument).filter(
        and_(
            UploadedDocument.id == doc_id,
            UploadedDocument.user_id == current_user.id,
            UploadedDocument.project_id == active_project.id,
        )
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    from app.services.rag.singleton import get_pipeline
    pipeline = get_pipeline()
    if not pipeline:
        raise HTTPException(status_code=503, detail="RAG pipeline not initialized")

    raw_chunks = pipeline.vdb.get_chunks_by_document_id(str(doc_id))
    total = len(raw_chunks)
    page = raw_chunks[offset: offset + limit]
    items = [
        ChunkItem(
            chunk_index=c["metadata"].get("chunk_index", offset + i),
            text=c["text"],
            metadata=c["metadata"],
        )
        for i, c in enumerate(page)
    ]
    return DocumentChunksResponse(chunks=items, total=total, has_more=offset + limit < total)


# ── Fix 1: short-lived content token ──────────────────────────────────────────

class ContentTokenResponse(BaseModel):
    token: str


@router.get("/{id}/content-token", response_model=ContentTokenResponse, summary="Get short-lived content token")
def get_document_content_token(
    id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """Issue a 5-minute JWT for direct inline streaming (chat/search citations, PDF embed)."""
    try:
        doc_id = uuid.UUID(id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")

    query = db.query(UploadedDocument).filter(UploadedDocument.id == doc_id)
    auth_type = auth.get("type")
    token_data: dict = {"doc_id": str(doc_id), "scope": "content"}

    if auth_type == "widget":
        project_id = auth.get("project_id")
        user_id = auth.get("user_id")
        query = query.filter(
            UploadedDocument.project_id == project_id,
            and_(
                UploadedDocument.user_id == user_id,
            ) | (UploadedDocument.user_id.is_(None)),
        )
        token_data["auth_type"] = "widget"
        token_data["project_id"] = str(project_id)
    elif auth_type == "api_key":
        api_key = auth.get("api_key")
        key_project_id = getattr(api_key, "project_id", None) if api_key else None
        key_user_id = auth.get("user_id")
        if not key_project_id:
            raise HTTPException(status_code=403, detail="API key must be project-scoped for document content")
        query = query.filter(
            UploadedDocument.project_id == key_project_id,
            and_(
                UploadedDocument.user_id == key_user_id,
            ) | (UploadedDocument.user_id.is_(None)),
        )
        token_data["auth_type"] = "api_key"
        token_data["project_id"] = str(key_project_id)
        token_data["user_id"] = key_user_id
    elif auth_type == "user":
        user = auth.get("user")
        query = query.filter(UploadedDocument.user_id == user.id)
        token_data["sub"] = user.username
    else:
        raise HTTPException(status_code=401, detail="Authentication required")

    doc = query.first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    from app.auth import create_access_token
    token = create_access_token(
        data=token_data,
        expires_delta=timedelta(minutes=5),
    )
    return ContentTokenResponse(token=token)


@router.get("/{id}/content-stream", summary="Stream document content via token")
def get_document_content_stream(
    id: str,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Inline streaming endpoint for embed/iframe. Requires short-lived content token."""
    from jose import jwt, JWTError
    from app.settings import settings

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("scope") != "content":
        raise HTTPException(status_code=403, detail="Invalid token scope")
    if payload.get("doc_id") != id:
        raise HTTPException(status_code=403, detail="Token mismatch")

    try:
        doc_id = uuid.UUID(id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")

    token_auth_type = payload.get("auth_type", "user")
    query = db.query(UploadedDocument).filter(UploadedDocument.id == doc_id)

    if token_auth_type == "widget":
        try:
            project_id = uuid.UUID(str(payload.get("project_id")))
        except (ValueError, TypeError):
            raise HTTPException(status_code=403, detail="Invalid token project")
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=403, detail="Invalid token project")
        query = query.filter(
            UploadedDocument.project_id == project_id,
            and_(
                UploadedDocument.user_id == project.owner_id,
            ) | (UploadedDocument.user_id.is_(None)),
        )
    elif token_auth_type == "api_key":
        try:
            project_id = uuid.UUID(str(payload.get("project_id")))
        except (ValueError, TypeError):
            raise HTTPException(status_code=403, detail="Invalid token project")
        key_user_id = payload.get("user_id")
        query = query.filter(
            UploadedDocument.project_id == project_id,
            and_(
                UploadedDocument.user_id == key_user_id,
            ) | (UploadedDocument.user_id.is_(None)),
        )
    else:
        username = payload.get("sub")
        user = db.query(User).filter(User.username == username).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        query = query.filter(UploadedDocument.user_id == user.id)

    doc = query.first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    content_bytes = _resolve_uploaded_document_bytes(db, doc)
    if not content_bytes:
        raise HTTPException(status_code=404, detail="Document not found")

    media_type = _document_media_type(doc.type)
    return StreamingResponse(
        io.BytesIO(content_bytes),
        media_type=media_type,
        headers={
            "Content-Disposition": _content_disposition(
                _stream_disposition_for_media(media_type),
                doc.title,
            )
        },
    )
