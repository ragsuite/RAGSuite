import type {
  CrawlDocument,
  DocumentFormPayload,
} from "@/features/crawl/types/crawl.types";
import { isDocumentIngestInFlight } from "@/features/crawl/utils/crawl-document-status";
import type { ItemEmbeddingCoverageEntry } from "@/features/search-config/types/embedding.types";

export const DOCUMENT_LANGUAGE_OPTIONS = [
  { key: "en", label: "English" },
  { key: "de", label: "German" },
  { key: "fr", label: "French" },
] as const;

export const DOCUMENT_UPLOAD_FORMAT_HINT =
  "PDF, DOC, DOCX, TXT, MD, HTML, ZIP (max 50MB each). ZIPs are extracted in the browser.";

export const DEFAULT_DOCUMENT_FORM: DocumentFormPayload = {
  fileNames: [],
  title: "",
  description: "",
  language: "en",
  sourceLabel: "",
  uploadAsFolder: false,
};

export function documentToForm(document: CrawlDocument): DocumentFormPayload {
  return {
    fileNames: [document.name],
    title: document.title ?? document.name,
    description: document.description ?? "",
    language: document.language,
    sourceLabel: document.sourceLabel,
    uploadAsFolder: false,
  };
}

export function inferMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

export function formatDocumentIndexedDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDocumentFileLabel(fileNames: string[]): string {
  if (fileNames.length === 0) return "No file chosen";
  if (fileNames.length === 1) return fileNames[0];
  return `${fileNames.length} files selected`;
}

/** Short badge / meta label for MIME types (Google Drive Apps MIME types especially). */
export function formatDocumentMimeBadge(mimeType: string): string {
  const mime = mimeType.trim().toLowerCase();
  if (!mime) return "File";

  const googleApps: Record<string, string> = {
    "application/vnd.google-apps.spreadsheet": "Sheets",
    "application/vnd.google-apps.document": "Docs",
    "application/vnd.google-apps.presentation": "Slides",
    "application/vnd.google-apps.drawing": "Drawing",
    "application/vnd.google-apps.form": "Forms",
    "application/vnd.google-apps.folder": "Folder",
    "application/vnd.google-apps.shortcut": "Shortcut",
    "application/vnd.google-apps.script": "Apps Script",
    "application/vnd.google-apps.map": "Map",
    "application/vnd.google-apps.site": "Site",
    "application/vnd.google-apps.jam": "Jam",
  };
  if (googleApps[mime]) return googleApps[mime];

  const known: Record<string, string> = {
    "application/pdf": "PDF",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "DOCX",
    "application/vnd.ms-excel": "XLS",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.ms-powerpoint": "PPT",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "PPTX",
    "application/pptx": "PPTX",
    "application/ppt": "PPT",
    "text/plain": "TXT",
    "text/markdown": "MD",
    "text/html": "HTML",
    "application/json": "JSON",
    "text/csv": "CSV",
    "application/zip": "ZIP",
    "application/octet-stream": "File",
  };
  if (known[mime]) return known[mime];

  if (mime.startsWith("image/")) {
    const subtype = mime.slice("image/".length).toUpperCase();
    return subtype || "Image";
  }
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("text/")) {
    const subtype = mime.slice("text/".length).toUpperCase();
    return subtype || "Text";
  }

  // Fallback: last path segment, truncate (never dump full vendor MIME strings)
  const leaf = mime.includes("/") ? mime.split("/").pop()! : mime;
  const cleaned = leaf
    .replace(/^vnd\./, "")
    .replace(/^x-/, "")
    .replace(/^google-apps\./, "")
    .replace(/openxmlformats-officedocument\./, "")
    .replace(/wordprocessingml\.document/, "DOCX")
    .replace(/spreadsheetml\.sheet/, "XLSX")
    .replace(/presentationml\.presentation/, "PPTX");
  if (cleaned.length <= 18) return cleaned.toUpperCase();
  return `${cleaned.slice(0, 15)}…`.toUpperCase();
}

export function formatDocumentStatusLabel(
  status: CrawlDocument["status"],
): string {
  if (status === "indexed") return "Indexed";
  if (status === "queued") return "Queued";
  if (status === "extracting") return "Extracting";
  if (status === "indexing") return "Indexing";
  if (status === "failed") return "Failed";
  return status;
}

export function resolveDocumentStatusLabel(
  document: CrawlDocument,
  coverage?: ItemEmbeddingCoverageEntry | null,
): string {
  if (document.status === "indexed") {
    if (coverage?.missing_active) return "Processed";
    return "Indexed";
  }
  return formatDocumentStatusLabel(document.status);
}

export function documentStatusShowsPulse(
  status: CrawlDocument["status"],
): boolean {
  return isDocumentIngestInFlight(status);
}

export function formatDocumentChunkLabel(chunksCount: number): string {
  return `${chunksCount} chunk${chunksCount === 1 ? "" : "s"}`;
}
