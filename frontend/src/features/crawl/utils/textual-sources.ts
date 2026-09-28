import type { CrawlDocument, CrawlPrimaryTab } from '@/features/crawl/types/crawl.types';
import type {
  QaPairDraft,
  QaPairValue,
  QaSourceForm,
  QaSourceRequest,
  TextSourceForm,
  TextSourceRequest,
  TextualSourceKind,
} from '@/features/crawl/types/textual-source.types';
import { DOCUMENT_LANGUAGE_OPTIONS } from '@/features/crawl/utils/document-form';

/** Must match ``app.services.textual_sources`` source labels. */
export const TEXT_SOURCE_LABEL = 'text';
export const QA_SOURCE_LABEL = 'qa_pairs';

/** Must match the backend validation limits in ``modules/documents/backend/textual_sources.py``. */
export const TEXTUAL_SOURCE_LIMITS = {
  title: 255,
  description: 2000,
  content: 200_000,
  pairs: 200,
  question: 500,
  answer: 4000,
} as const;

const SOURCE_LABEL_BY_KIND: Record<TextualSourceKind, string> = {
  text: TEXT_SOURCE_LABEL,
  qa: QA_SOURCE_LABEL,
};

const DOCUMENT_BACKED_TABS: ReadonlySet<CrawlPrimaryTab> = new Set(['document', 'text', 'qa-pairs']);
const DEFAULT_LANGUAGE = DOCUMENT_LANGUAGE_OPTIONS[0].key;

export function isDocumentBackedTab(tab: CrawlPrimaryTab): boolean {
  return DOCUMENT_BACKED_TABS.has(tab);
}

export function textualKindForDocument(doc: Pick<CrawlDocument, 'sourceLabel'>): TextualSourceKind | null {
  const label = String(doc.sourceLabel ?? '').trim().toLowerCase();
  if (label === TEXT_SOURCE_LABEL) return 'text';
  if (label === QA_SOURCE_LABEL) return 'qa';
  return null;
}

export function isTextualSourceDocument(doc: Pick<CrawlDocument, 'sourceLabel'>): boolean {
  return textualKindForDocument(doc) !== null;
}

export function filterTextualSources(documents: CrawlDocument[], kind: TextualSourceKind): CrawlDocument[] {
  const label = SOURCE_LABEL_BY_KIND[kind];
  return documents.filter((doc) => String(doc.sourceLabel ?? '').trim().toLowerCase() === label);
}

export function textualLanguageLabel(language: string | null | undefined): string {
  const value = String(language ?? '').trim().toLowerCase();
  return DOCUMENT_LANGUAGE_OPTIONS.find((option) => option.key === value)?.label ?? String(language ?? '');
}

function normalizeLanguage(language: string | null | undefined): string {
  const value = String(language ?? '').trim().toLowerCase();
  return DOCUMENT_LANGUAGE_OPTIONS.some((option) => option.key === value) ? value : DEFAULT_LANGUAGE;
}

let pairSeq = 0;

export function createQaPairDraft(question = '', answer = ''): QaPairDraft {
  pairSeq += 1;
  return { id: `qa-pair-${Date.now().toString(36)}-${pairSeq}`, question, answer };
}

export function emptyTextSourceForm(): TextSourceForm {
  return { title: '', content: '', description: '', language: DEFAULT_LANGUAGE };
}

export function emptyQaSourceForm(): QaSourceForm {
  return { title: '', pairs: [createQaPairDraft()], description: '', language: DEFAULT_LANGUAGE };
}

export function textSourceFormFromDocument(doc: CrawlDocument, content: string): TextSourceForm {
  return {
    title: doc.title ?? doc.name,
    content,
    description: doc.description ?? '',
    language: normalizeLanguage(doc.language),
  };
}

/** Parse stored Q&A JSON (``{"pairs": [...]}``); drops incomplete pairs. */
export function parseQaPairsContent(raw: string): QaPairValue[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? (data as { pairs?: unknown }).pairs
      : null;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const question = typeof record.question === 'string' ? record.question.trim() : '';
    const answer = typeof record.answer === 'string' ? record.answer.trim() : '';
    return question && answer ? [{ question, answer }] : [];
  });
}

export function qaSourceFormFromDocument(doc: CrawlDocument, raw: string): QaSourceForm {
  const pairs = parseQaPairsContent(raw).map((pair) => createQaPairDraft(pair.question, pair.answer));
  return {
    title: doc.title ?? doc.name,
    pairs: pairs.length > 0 ? pairs : [createQaPairDraft()],
    description: doc.description ?? '',
    language: normalizeLanguage(doc.language),
  };
}

/** Returns an i18n key for the first validation problem, or null when valid. */
export function validateTextSourceForm(form: TextSourceForm): string | null {
  if (!form.title.trim()) return 'crawl.textual.validation.nameRequired';
  if (!form.content.trim()) return 'crawl.text.validation.contentRequired';
  if (form.content.length > TEXTUAL_SOURCE_LIMITS.content) return 'crawl.text.validation.contentTooLong';
  return null;
}

export function isQaPairBlank(pair: QaPairDraft): boolean {
  return !pair.question.trim() && !pair.answer.trim();
}

export function validateQaSourceForm(form: QaSourceForm): string | null {
  if (!form.title.trim()) return 'crawl.textual.validation.nameRequired';
  const filled = form.pairs.filter((pair) => !isQaPairBlank(pair));
  if (filled.length === 0) return 'crawl.qa.validation.pairsRequired';
  if (filled.length > TEXTUAL_SOURCE_LIMITS.pairs) return 'crawl.qa.validation.tooManyPairs';
  if (filled.some((pair) => !pair.question.trim() || !pair.answer.trim())) {
    return 'crawl.qa.validation.pairIncomplete';
  }
  return null;
}

function optionalDescription(description: string): string | undefined {
  const trimmed = description.trim();
  return trimmed ? trimmed : undefined;
}

export function toTextSourceRequest(form: TextSourceForm): TextSourceRequest {
  return {
    title: form.title.trim(),
    content: form.content.trim(),
    description: optionalDescription(form.description),
    language: form.language,
  };
}

export function toQaSourceRequest(form: QaSourceForm): QaSourceRequest {
  return {
    title: form.title.trim(),
    pairs: form.pairs
      .filter((pair) => !isQaPairBlank(pair))
      .map((pair) => ({ question: pair.question.trim(), answer: pair.answer.trim() })),
    description: optionalDescription(form.description),
    language: form.language,
  };
}
