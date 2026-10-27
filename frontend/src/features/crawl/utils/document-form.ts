import type {
  CrawlDocument,
  DocumentFormPayload,
} from "@/features/crawl/types/crawl.types";
import { emptySplitConfig, parseSplitConfig, toDocumentSplitMetadata } from "@/features/crawl/utils/split-config";

export const DOCUMENT_LANGUAGE_OPTIONS = [
  { key: "en", label: "English" },
  { key: "de", label: "German" },
  { key: "fr", label: "French" },
] as const;

export const DEFAULT_DOCUMENT_FORM: DocumentFormPayload = {
  fileNames: [],
  title: "",
  description: "",
  language: "en",
  sourceLabel: "",
  uploadAsFolder: false,
  pdfPageFrom: null,
  pdfPageTo: null,
  pdfStripChrome: true,
  pdfStripHeader: true,
  pdfStripFooter: true,
  extractEngine: 'native',
  ocrModel: '',
  ...emptySplitConfig('document'),
};

export function parsePdfPageField(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

export type ExtractFileKind = "pdf" | "pptx" | "xlsx" | "docx" | "zip" | "other";
export type ExtractRangeUnit = "page" | "slide" | "sheet" | "mixed";

export type ExtractFieldVisibility = {
  showRange: boolean;
  showStrip: boolean;
  showEngine: boolean;
  rangeUnit: ExtractRangeUnit;
};

function fileLeaf(name: string | null | undefined): string {
  return (name || "").split("?")[0].trim().toLowerCase();
}

export function isPdfFileName(name: string | null | undefined): boolean {
  return fileLeaf(name).endsWith(".pdf");
}

export function isSpreadsheetFileName(name: string | null | undefined): boolean {
  const leaf = fileLeaf(name);
  return leaf.endsWith(".xlsx") || leaf.endsWith(".csv");
}

function isSpreadsheetMime(mimeType: string | null | undefined): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (!mime) return false;
  return (
    mime.includes("spreadsheet") ||
    mime.includes("xlsx") ||
    mime.includes("excel") ||
    mime === "text/csv" ||
    mime.endsWith("/csv")
  );
}

export function kindFromFileName(name: string | null | undefined): ExtractFileKind {
  const leaf = fileLeaf(name);
  if (leaf.endsWith(".pdf")) return "pdf";
  if (leaf.endsWith(".pptx")) return "pptx";
  if (leaf.endsWith(".xlsx")) return "xlsx";
  if (leaf.endsWith(".docx")) return "docx";
  if (leaf.endsWith(".zip")) return "zip";
  return "other";
}

export function kindFromDocument(
  document: Pick<CrawlDocument, "mimeType" | "name" | "title">,
): ExtractFileKind {
  const fromName = kindFromFileName(document.name);
  if (fromName !== "other") return fromName;
  const fromTitle = kindFromFileName(document.title);
  if (fromTitle !== "other") return fromTitle;
  const mime = (document.mimeType || "").toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("presentation") || mime.includes("pptx")) return "pptx";
  if (mime.includes("spreadsheet") || mime.includes("xlsx") || mime.includes("excel")) return "xlsx";
  if (mime.includes("wordprocessingml") || mime.includes("docx")) return "docx";
  return "other";
}

export function isPdfDocument(document: Pick<CrawlDocument, "mimeType" | "name" | "title">): boolean {
  return kindFromDocument(document) === "pdf";
}

function visibilityForKinds(kinds: ExtractFileKind[]): ExtractFieldVisibility {
  const set = new Set(kinds);
  const showEngine =
    set.has("zip") || set.has("pdf") || set.has("pptx") || set.has("xlsx") || set.has("docx");
  if (set.has("zip")) {
    return { showRange: true, showStrip: true, showEngine, rangeUnit: "mixed" };
  }
  const rangeKinds = (["pdf", "pptx", "xlsx"] as const).filter((kind) => set.has(kind));
  const showRange = rangeKinds.length > 0;
  const showStrip = set.has("pdf") || set.has("pptx") || set.has("docx");
  let rangeUnit: ExtractRangeUnit = "page";
  if (rangeKinds.length > 1) rangeUnit = "mixed";
  else if (rangeKinds[0] === "pptx") rangeUnit = "slide";
  else if (rangeKinds[0] === "xlsx") rangeUnit = "sheet";
  else rangeUnit = "page";
  return { showRange, showStrip, showEngine, rangeUnit };
}

export function extractFieldVisibility(params: {
  mode: "upload" | "edit";
  fileNames: string[];
  document?: CrawlDocument | null;
}): ExtractFieldVisibility {
  if (params.mode === "edit") {
    if (!params.document) return { showRange: false, showStrip: false, showEngine: false, rangeUnit: "page" };
    return visibilityForKinds([kindFromDocument(params.document)]);
  }
  if (params.fileNames.length === 0) {
    return { showRange: false, showStrip: false, showEngine: false, rangeUnit: "page" };
  }
  return visibilityForKinds(params.fileNames.map(kindFromFileName));
}

export function showExcelAsHtmlForDocument(params: {
  mode: "upload" | "edit";
  fileNames: string[];
  document?: Pick<CrawlDocument, "mimeType" | "name" | "title"> | null;
}): boolean {
  if (params.mode === "edit") {
    if (!params.document) return false;
    if (isSpreadsheetFileName(params.document.name) || isSpreadsheetFileName(params.document.title)) {
      return true;
    }
    if (kindFromDocument(params.document) === "xlsx") return true;
    return isSpreadsheetMime(params.document.mimeType);
  }
  return params.fileNames.some(isSpreadsheetFileName);
}

/** @deprecated Use extractFieldVisibility — kept for callers that only need a boolean. */
export function shouldShowPdfExtractFields(params: {
  mode: "upload" | "edit";
  fileNames: string[];
  document?: CrawlDocument | null;
}): boolean {
  const visibility = extractFieldVisibility(params);
  return visibility.showRange || visibility.showStrip || visibility.showEngine;
}

export function toDocumentPdfMetadata(payload: DocumentFormPayload): {
  pdf_page_from: number | null;
  pdf_page_to: number | null;
  pdf_strip_chrome: boolean;
  pdf_strip_header: boolean;
  pdf_strip_footer: boolean;
  extract_engine?: 'native' | 'docling';
  ocr_model?: string | null;
} {
  const stripHeader = payload.pdfStripHeader !== false;
  const stripFooter = payload.pdfStripFooter !== false;
  const ocrModel = payload.ocrModel?.trim() || '';
  return {
    pdf_page_from: payload.pdfPageFrom ?? null,
    pdf_page_to: payload.pdfPageTo ?? null,
    pdf_strip_header: stripHeader,
    pdf_strip_footer: stripFooter,
    pdf_strip_chrome: stripHeader || stripFooter,
    extract_engine: payload.extractEngine === 'docling' || ocrModel ? 'docling' : 'native',
    ocr_model: ocrModel || null,
  };
}

export function toDocumentSplitFields(
  payload: DocumentFormPayload,
  options?: { omitNative?: boolean },
) {
  const split = parseSplitConfig(payload, 'document');
  return toDocumentSplitMetadata(
    {
      ...split,
      splitMode: payload.splitMode === 'custom' ? 'custom' : split.splitMode,
      chunkSize: payload.chunkSize ?? split.chunkSize,
      chunkOverlap: payload.chunkOverlap ?? split.chunkOverlap,
      delimiterPreset: payload.delimiterPreset ?? split.delimiterPreset,
      delimiterPresets: payload.delimiterPresets ?? split.delimiterPresets,
      delimiterCustom: payload.delimiterCustom ?? split.delimiterCustom,
      parentChild: payload.parentChild ?? split.parentChild,
      tableContext: payload.tableContext ?? split.tableContext,
      excelAsHtml: payload.excelAsHtml ?? split.excelAsHtml,
    },
    options,
  );
}

export function documentToForm(document: CrawlDocument): DocumentFormPayload {
  return {
    fileNames: [document.name],
    title: document.title ?? document.name,
    description: document.description ?? "",
    language: document.language,
    sourceLabel: document.sourceLabel,
    uploadAsFolder: false,
    pdfPageFrom: document.pdfPageFrom ?? null,
    pdfPageTo: document.pdfPageTo ?? null,
    pdfStripHeader: document.pdfStripHeader ?? document.pdfStripChrome ?? false,
    pdfStripFooter: document.pdfStripFooter ?? document.pdfStripChrome ?? false,
    pdfStripChrome: document.pdfStripChrome ?? (
      (document.pdfStripHeader ?? false) || (document.pdfStripFooter ?? false)
    ),
    extractEngine: document.extractEngine === 'docling' ? 'docling' : 'native',
    ocrModel: document.ocrModel ?? '',
    ...parseSplitConfig(document, 'document'),
  };
}

export function inferMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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

export function formatDocumentChunkLabel(chunksCount: number): string {
  return `${chunksCount} chunk${chunksCount === 1 ? "" : "s"}`;
}
