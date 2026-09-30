import { parseAssistantMarkdownBlocks } from '@/shared/utils/parse-assistant-markdown';
import {
  getRenderablePlainText,
  htmlToPlainText,
  isHtmlContent,
} from '@/shared/utils/html-content';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function webWindow(): (Window & typeof globalThis) | null {
  if (typeof window === 'undefined') return null;
  return window;
}

export function isSecureWebContext(): boolean {
  const w = webWindow();
  if (!w) return false;
  return Boolean(w.isSecureContext);
}

export function prefersReducedMotion(): boolean {
  const w = webWindow();
  if (!w?.matchMedia) return false;
  try {
    return w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = webWindow() as
    | (Window & {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      })
    | null;
  if (!w) return null;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return isSecureWebContext() && getSpeechRecognitionCtor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  const w = webWindow();
  return Boolean(w && isSecureWebContext() && typeof w.speechSynthesis !== 'undefined');
}

/** Map widget language codes (en, en-gb, de, …) to BCP-47 for Web Speech. */
export function toSpeechLocale(language?: string | null): string {
  const raw = (language || 'en').trim().replace(/_/g, '-').toLowerCase();
  const map: Record<string, string> = {
    // English (US) is the product default — do not force Indian English.
    en: 'en-US',
    'en-us': 'en-US',
    'en-in': 'en-IN',
    'en-gb': 'en-GB',
    'en-au': 'en-AU',
    'en-ca': 'en-CA',
    de: 'de-DE',
    fr: 'fr-FR',
    es: 'es-ES',
    hi: 'hi-IN',
    bn: 'bn-IN',
    gu: 'gu-IN',
    mr: 'mr-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
    pa: 'pa-IN',
    ur: 'ur-IN',
    it: 'it-IT',
    nl: 'nl-NL',
    pl: 'pl-PL',
    tr: 'tr-TR',
    ru: 'ru-RU',
    ja: 'ja-JP',
    ko: 'ko-KR',
    ar: 'ar-SA',
    he: 'he-IL',
    id: 'id-ID',
    ms: 'ms-MY',
    th: 'th-TH',
    vi: 'vi-VN',
    pt: 'pt-PT',
    'pt-br': 'pt-BR',
    zh: 'zh-CN',
    'zh-cn': 'zh-CN',
    'zh-hk': 'zh-HK',
    'zh-tw': 'zh-TW',
  };
  if (map[raw]) return map[raw];
  if (/^[a-z]{2,3}-[a-z]{2}$/.test(raw)) {
    const [a, b] = raw.split('-');
    return `${a}-${b.toUpperCase()}`;
  }
  if (/^[a-z]{2,3}$/.test(raw)) return `${raw}-${raw.toUpperCase()}`;
  return 'en-US';
}

/**
 * Locale for browser SpeechRecognition (STT).
 * Uses the browser/OS language — never widget answer language — so spoken
 * queries are transcribed as spoken, not forced into chatbot/search language.
 */
export function resolveSttLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language?.trim()) {
    return navigator.language.trim();
  }
  return 'en-US';
}

/** Human-like pauses between spoken segments (ms). */
export const SPEECH_PAUSES = {
  /**
   * Extra gap after a newline when the engine did not already pause
   * (no trailing . ! ?). Keep short — stacked with Web Speech it felt ~2s.
   */
  paragraph: 200,
  /** Title, heading, or label (often no period). */
  heading: 240,
  /** Rare explicit sentence gap when chunks cannot be merged. */
  sentence: 140,
  /**
   * After a punctuated line / overflow wrap. The synthesizer already
   * inserts a stop on "." so this is only a tiny handoff.
   */
  clause: 80,
  /** Final segment — no trailing wait. */
  end: 0,
} as const;

export type SpeechSegment = {
  text: string;
  pauseAfterMs: number;
};

export const PROFESSIONAL_TTS = {
  /** Slightly below default — calm, not punchy on every syllable. */
  rate: 0.93,
  pitch: 0.96,
  /** Softer output so speech does not feel “hard-hitting”. */
  volume: 0.86,
  maxChunkChars: 420,
} as const;

const DECIMAL_POINT = '\uE000';

/**
 * Tokens that look like sentence ends to Web Speech (Pvt. Ltd.) but are not.
 * Expanded to spoken words so the engine does not take a long period-pause.
 */
const ABBREVIATION_TOKENS = new Set([
  'pvt',
  'ltd',
  'inc',
  'corp',
  'co',
  'llc',
  'llp',
  'plc',
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'no',
  'vs',
  'etc',
  'approx',
  'vol',
  'fig',
  'dept',
  'est',
  'al',
  'viz',
  // German
  'usw',
  'bzw',
  'nr',
  'ca',
]);

/** Spoken forms for abbreviations whose periods must not become sentence breaks. */
const ABBREVIATION_REPLACEMENTS: [RegExp, string][] = [
  [/\bPvt\.?\s*Ltd\.?/gi, 'Private Limited'],
  [/\bLtd\./gi, 'Limited'],
  [/\bPvt\./gi, 'Private'],
  [/\bInc\./gi, 'Incorporated'],
  [/\bCorp\./gi, 'Corporation'],
  [/\bLLC\b\.?/g, 'LLC'],
  [/\bLLP\b\.?/g, 'LLP'],
  [/\bPlc\./gi, 'PLC'],
  [/\bCo\.(?=\s|$)/g, 'Company'],
  [/\be\.?\s*g\.?(?=\s|,|;|:|$)/gi, 'for example'],
  [/\bi\.?\s*e\.?(?=\s|,|;|:|$)/gi, 'that is'],
  [/\betc\.?(?=\s|,|;|:|$)/gi, 'and so on'],
  [/\bvs\.?(?=\s|,|;|:|$)/gi, 'versus'],
  [/\bapprox\.?(?=\s|,|;|:|$)/gi, 'approximately'],
  [/\bmin\.?(?=\s|,|;|:|$)/gi, 'minutes'],
  [/\bmax\.?(?=\s|,|;|:|$)/gi, 'maximum'],
  [/\bDr\.(?=\s|[A-Z])/g, 'Doctor'],
  [/\bMr\.(?=\s|[A-Z])/g, 'Mister'],
  [/\bMrs\.(?=\s|[A-Z])/g, 'Missus'],
  [/\bMs\.(?=\s|[A-Z])/g, 'Miss'],
  [/\bProf\.(?=\s|[A-Z])/g, 'Professor'],
  [/\bJr\.(?=\s|$)/g, 'Junior'],
  [/\bSr\.(?=\s|[A-Z])/g, 'Senior'],
  [/\bSt\.(?=\s|[A-Z])/g, 'Saint'],
  [/\bNo\.(?=\s|\d)/g, 'Number'],
  [/\bU\.S\.A?\.?(?=\s|,|;|:|$)/g, 'United States'],
  [/\bU\.K\.?(?=\s|,|;|:|$)/g, 'United Kingdom'],
  [/\ba\.?\s*m\.?(?=\s|,|;|:|$)/gi, 'AM'],
  [/\bp\.?\s*m\.?(?=\s|,|;|:|$)/gi, 'PM'],
  // German — keep spoken↔visible maps aligned with visible text
  [/\bz\.\s*B\.(?=\s|,|;|:|$)/gi, 'zum Beispiel'],
  [/\busw\.(?=\s|,|;|:|$)/gi, 'und so weiter'],
  [/\bbzw\.(?=\s|,|;|:|$)/gi, 'beziehungsweise'],
  [/\bNr\.(?=\s|\d)/g, 'Nummer'],
  [/\bca\.(?=\s|,|;|:|$)/gi, 'circa'],
];

function protectDecimalPoints(text: string): string {
  return text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_POINT}$2`);
}

function restoreDecimalPoints(text: string): string {
  return text.replace(new RegExp(DECIMAL_POINT, 'g'), '.');
}

/** Expand abbreviations and protect decimals before sentence detection. */
export function expandAbbreviationsForSpeech(text: string): string {
  let out = protectDecimalPoints(text);
  for (const [pattern, spoken] of ABBREVIATION_REPLACEMENTS) {
    out = out.replace(pattern, spoken);
  }
  return restoreDecimalPoints(out);
}

type CharCell = { ch: string; visWord: number };

function textToVisWordCells(text: string): CharCell[] {
  const wordAt = new Array<number>(text.length).fill(-1);
  let wordIndex = 0;
  for (const match of text.matchAll(/\S+/g)) {
    const start = match.index ?? 0;
    for (let i = start; i < start + match[0].length; i += 1) {
      wordAt[i] = wordIndex;
    }
    wordIndex += 1;
  }
  let last = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (wordAt[i] >= 0) last = wordAt[i];
    else wordAt[i] = last;
  }
  return Array.from(text, (ch, i) => ({ ch, visWord: wordAt[i] ?? 0 }));
}

function cellsToString(cells: CharCell[]): string {
  return cells.map((cell) => cell.ch).join('');
}

function replaceCellsRange(
  cells: CharCell[],
  pattern: RegExp,
  replacement: string,
): CharCell[] {
  const source = cellsToString(cells);
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out: CharCell[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = re.exec(source);
  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      out.push(...cells.slice(lastIndex, start));
    }
    let visWord = cells[start]?.visWord ?? 0;
    for (let i = start; i < end; i += 1) {
      const ch = cells[i]?.ch ?? '';
      if (ch && !/\s/.test(ch)) {
        visWord = cells[i].visWord;
        break;
      }
    }
    for (const ch of replacement) {
      out.push({ ch, visWord });
    }
    lastIndex = end;
    if (match[0].length === 0) {
      re.lastIndex += 1;
    }
    match = re.exec(source);
  }
  if (lastIndex < cells.length) {
    out.push(...cells.slice(lastIndex));
  }
  return out;
}

/**
 * Map each spoken (post-abbreviation-expansion) word index to the visible
 * plain-text word index the UI highlights. Many spoken words can point at one
 * visible token (e.g. "e.g." → "for example").
 */
export function buildSpokenToVisibleWordMap(visiblePlain: string): {
  spokenToVisible: number[];
  visibleWordCount: number;
  spokenWordCount: number;
} {
  const prepared = prepareTextForSpeech(visiblePlain);
  const visibleMatches = prepared.match(/\S+/g);
  const visibleWordCount = visibleMatches?.length ?? 0;
  if (!prepared || visibleWordCount === 0) {
    return { spokenToVisible: [], visibleWordCount: 0, spokenWordCount: 0 };
  }

  let cells = textToVisWordCells(prepared);
  // Same length as protectDecimalPoints — swap the digit-separating '.' only.
  for (let i = 1; i < cells.length - 1; i += 1) {
    if (/\d/.test(cells[i - 1].ch) && cells[i].ch === '.' && /\d/.test(cells[i + 1].ch)) {
      cells[i] = { ch: DECIMAL_POINT, visWord: cells[i].visWord };
    }
  }
  for (const [pattern, spoken] of ABBREVIATION_REPLACEMENTS) {
    cells = replaceCellsRange(cells, pattern, spoken);
  }
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i].ch === DECIMAL_POINT) {
      cells[i] = { ch: '.', visWord: cells[i].visWord };
    }
  }

  const spokenToVisible: number[] = [];
  let i = 0;
  while (i < cells.length) {
    if (/\s/.test(cells[i].ch)) {
      i += 1;
      continue;
    }
    const visWord = cells[i].visWord;
    while (i < cells.length && !/\s/.test(cells[i].ch)) {
      i += 1;
    }
    spokenToVisible.push(Math.max(0, Math.min(visWord, visibleWordCount - 1)));
  }

  return {
    spokenToVisible,
    visibleWordCount,
    spokenWordCount: spokenToVisible.length,
  };
}

function asPlainString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return String(value);
  } catch {
    return '';
  }
}

/** Strip emoji / pictographs without unicode-property regex (safer across engines). */
function stripEmojiNoise(text: string): string {
  try {
    return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ');
  } catch {
    return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ' ');
  }
}

/** Keep heading / list / paragraph breaks so TTS can pause without a period. */
function normalizeSpeechWhitespace(text: string): string {
  return text
    .replace(/^•\s+/gm, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripSpeechMarkup(text: string): string {
  const input = asPlainString(text);
  if (!input) return '';
  return normalizeSpeechWhitespace(
    input
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1'),
  );
}

/** Normalize AI/markdown text before TTS so it reads cleanly aloud. */
export function prepareTextForSpeech(text: string): string {
  try {
    let out = stripSpeechMarkup(text);
    out = stripEmojiNoise(out)
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/www\.\S+/gi, ' ')
      .replace(/[#*_~|`]/g, ' ')
      .replace(/[^\S\n]+([,.;:!?।])/g, '$1')
      .replace(/([.!?।])([^\s])/g, '$1 $2');
    return normalizeSpeechWhitespace(out);
  } catch {
    return normalizeSpeechWhitespace(asPlainString(text));
  }
}

function markdownBlockToSpeech(block: ReturnType<typeof parseAssistantMarkdownBlocks>[number]): string {
  switch (block.type) {
    case 'code':
      return '';
    case 'table':
      return (block.rows ?? []).flat().filter(Boolean).join('. ');
    case 'heading':
      return asPlainString(block.text).trim();
    case 'bullet':
    case 'ordered':
      return asPlainString(block.text).trim();
    default:
      return asPlainString(block.text);
  }
}

/** Plain speakable text from chat markdown or search HTML — matches what users read. */
export function getSpeechPlainText(content: unknown): string {
  try {
    const raw = asPlainString(content);
    if (!raw.trim()) return '';
    if (isHtmlContent(raw)) {
      return prepareTextForSpeech(htmlToPlainText(raw));
    }

    const blocks = parseAssistantMarkdownBlocks(raw);
    if (blocks.length > 0) {
      const spoken = blocks
        .map(markdownBlockToSpeech)
        .filter(Boolean)
        .join('\n\n');
      if (spoken.trim()) {
        return prepareTextForSpeech(spoken);
      }
    }

    return prepareTextForSpeech(getRenderablePlainText(raw));
  } catch {
    return normalizeSpeechWhitespace(asPlainString(content));
  }
}

function lastDotToken(text: string): string {
  const match = text.match(/([A-Za-z]{1,5})\.\s*$/);
  return (match?.[1] ?? '').toLowerCase();
}

/** True when the trailing period is part of an abbreviation (e.g. e.g., z.B.). */
export function isAbbreviationPeriod(current: string): boolean {
  if (/\bz\.\s*B\.\s*$/i.test(current)) return true;
  const token = lastDotToken(current);
  return Boolean(token) && ABBREVIATION_TOKENS.has(token);
}

function isSentenceTerminator(ch: string): boolean {
  return /[.!?।]/.test(ch);
}

function startsNewSentenceAfter(ch: string, current: string, nextChar: string, atEnd: boolean): boolean {
  if (atEnd) return true;
  if (!nextChar) return false;

  if (ch === '.' && isAbbreviationPeriod(current)) return false;
  if (ch === '.' && /[a-z]/.test(nextChar)) return false;

  // "?" / "!" / danda / real period: next sentence may start in Latin or Hindi.
  return /[A-Z0-9"'(\[\u00C0-\uFFFF]/.test(nextChar);
}

/** Split a paragraph into sentences without breaking abbreviations like e.g. or decimals. */
export function splitIntoSentences(text: string): string[] {
  const normalized = expandAbbreviationsForSpeech(text.replace(/[^\S\n]+/g, ' ').trim());
  if (!normalized) return [];

  const protectedText = protectDecimalPoints(normalized);
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < protectedText.length; i += 1) {
    const ch = protectedText[i];
    current += ch;
    if (!isSentenceTerminator(ch)) continue;

    const rest = protectedText.slice(i + 1);
    const trimmedRest = rest.trimStart();
    const nextChar = trimmedRest[0] ?? '';
    const atEnd = trimmedRest.length === 0;

    if (startsNewSentenceAfter(ch, current, nextChar, atEnd)) {
      const sentence = restoreDecimalPoints(current.trim());
      if (sentence) sentences.push(sentence);
      current = '';
    }
  }

  const tail = restoreDecimalPoints(current.trim());
  if (tail) sentences.push(tail);
  return sentences;
}

function splitLongSentence(text: string, maxLen: number): SpeechSegment[] {
  const words = text.split(/\s+/).filter(Boolean);
  const parts: SpeechSegment[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxLen) {
      line = next;
      continue;
    }
    if (line) parts.push({ text: line, pauseAfterMs: SPEECH_PAUSES.clause });
    line = word.length <= maxLen ? word : word.slice(0, maxLen);
  }
  if (line) parts.push({ text: line, pauseAfterMs: SPEECH_PAUSES.sentence });
  return parts;
}

function isTitleLike(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[:：]$/.test(t)) return true;
  return t.length <= 90 && !/[.!?।]/.test(t);
}

function endsWithSpokenStop(text: string): boolean {
  return /[.!?।]["')\]]*$/.test(text.trim());
}

function pauseAfterBlock(text: string, isLastBlock: boolean): number {
  if (isLastBlock) return SPEECH_PAUSES.end;
  if (isTitleLike(text)) return SPEECH_PAUSES.heading;
  // Period + our old ~1s timer stacked with the engine stop (~2s perceived).
  if (endsWithSpokenStop(text)) return SPEECH_PAUSES.clause;
  return SPEECH_PAUSES.paragraph;
}

/**
 * Build calm, human-like speech segments with context-aware pauses.
 * Used by both chatbot and search voice output.
 */
export function buildSpeechSegments(
  text: string,
  maxLen: number = PROFESSIONAL_TTS.maxChunkChars,
): SpeechSegment[] {
  if (!text.trim()) return [];

  const prepared = expandAbbreviationsForSpeech(prepareTextForSpeech(text));
  const paragraphs = prepared
    .split(/\n{2,}|\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const segments: SpeechSegment[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentences = splitIntoSentences(paragraph);
    let buffer = '';

    const flushBuffer = (pauseAfterMs: number) => {
      const trimmed = buffer.trim();
      if (trimmed) segments.push({ text: trimmed, pauseAfterMs });
      buffer = '';
    };

    sentences.forEach((sentence, sentenceIndex) => {
      const isLastSentence = sentenceIndex === sentences.length - 1;
      const isLastParagraph = paragraphIndex === paragraphs.length - 1;
      const boundaryPause = isLastSentence
        ? isLastParagraph
          ? SPEECH_PAUSES.end
          : pauseAfterBlock(paragraph, false)
        : isTitleLike(sentence)
          ? SPEECH_PAUSES.heading
          : SPEECH_PAUSES.sentence;

      // Titles / labels without a period must be their own segment or they run on.
      if (isTitleLike(sentence) && !isLastSentence) {
        if (buffer) flushBuffer(SPEECH_PAUSES.sentence);
        segments.push({ text: sentence.trim(), pauseAfterMs: SPEECH_PAUSES.heading });
        return;
      }

      const candidate = buffer ? `${buffer} ${sentence}` : sentence;
      if (candidate.length <= maxLen) {
        buffer = candidate;
        if (isLastSentence) flushBuffer(boundaryPause);
        return;
      }

      if (buffer) flushBuffer(SPEECH_PAUSES.sentence);

      if (sentence.length <= maxLen) {
        buffer = sentence;
        if (isLastSentence) flushBuffer(boundaryPause);
        return;
      }

      const overflow = splitLongSentence(sentence, maxLen);
      overflow.forEach((part, partIndex) => {
        const isLastPart = partIndex === overflow.length - 1;
        segments.push({
          text: part.text,
          pauseAfterMs: isLastPart ? boundaryPause : SPEECH_PAUSES.clause,
        });
      });
    });
  });

  if (segments.length > 0) {
    segments[segments.length - 1].pauseAfterMs = SPEECH_PAUSES.end;
  }

  return segments;
}

/** @deprecated Use buildSpeechSegments — kept for tests. */
export function splitSpeechChunks(text: string, maxLen: number = PROFESSIONAL_TTS.maxChunkChars): string[] {
  return buildSpeechSegments(text, maxLen).map((segment) => segment.text);
}

type SpeechVoiceLike = {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
};

const LOW_QUALITY_VOICE = /compact|espeak|festival|pico|android|bad|robot/i;
const INDIAN_VOICE = /india|indian|hindi|hinglish|raveena|heera|lekha|veena|aditi|ananya|kajal|neerja|prabhat|rahul|हिन्दी/i;
const HINDI_VOICE_NAME = /hindi|हिन्दी|hi-in|google\s*hi\b|microsoft.*hi/i;
const PREMIUM_VOICE =
  /premium|enhanced|neural|natural|online|google|microsoft|samantha|daniel|karen|moira|tessa|alex|ava|jenny|aria|sonia|zira|david|allison|serena|victoria|fiona|vega|amelie|thomas|anna|helena|luciana|camila|francisca|antonio|conchita|heidi|petra|vicki|marlene|yannick|katja|conrad|amara|stefan|gisela|ingrid|damien|audrey|marie|nicolas|paulina|monica|jorge|diego|heera|raveena|veena|lekha|mariska|yuna|kyoko|laura|fred|susan|tom|nicky|oliver|mark|ting-ting|meijia|sin-ji|o-ren|sinji/i;
const GOOGLE_VOICE = /(google|wavenet|studio|journey)/i;
const MICROSOFT_NATURAL_VOICE = /(microsoft|aria|jenny|guy|natasha|sonia|riya|andrew|alloy|neural|katja|conrad|amara)/i;
const APPLE_NATURAL_VOICE = /(samantha|ava|allison|daniel|karen|moira|tessa|serena|victoria|anna|helena|petra)/i;
const FEMALE_VOICE =
  /female|woman|aria|jenny|natasha|sonia|riya|ava|allison|samantha|karen|moira|tessa|serena|victoria|raveena|heera|lekha|veena|aditi|ananya|neerja|heidi|petra|vicki|marlene|katja|amara|anna|helena/i;
const GERMAN_VOICE_NAME =
  /deutsch|german|de-de|heidi|petra|vicki|marlene|yannick|katja|conrad|amara|stefan|gisela|ingrid|anna/i;
const ENGLISH_VOICE_NAME =
  /english|en-us|en-gb|samantha|daniel|karen|moira|tessa|alex|ava|jenny|aria|sonia|zira|david|allison|serena|victoria|nicky|oliver|mark/i;

function voiceLangPrefix(lang: string): string {
  const normalized = (lang || '').toLowerCase().replace(/_/g, '-');
  const primary = normalized.split('-')[0] || '';
  // Chinese variants share zh-* family.
  if (primary === 'zh') return 'zh';
  return primary.slice(0, 2);
}

/** Prefer premium / cloud / enhanced voices over compact system defaults. */
export function selectProfessionalVoice(
  lang: string,
  voices: SpeechVoiceLike[],
): SpeechVoiceLike | null {
  if (!voices.length) return null;
  const target = lang.toLowerCase().replace(/_/g, '-');
  const prefix = voiceLangPrefix(target);
  if (!prefix) return null;
  const wantsIndianEnglish = target === 'en-in';
  const wantsHindi = prefix === 'hi';
  const wantsGerman = prefix === 'de';
  const wantsEnglish = prefix === 'en';

  let best: SpeechVoiceLike | null = null;
  let bestScore = -1;

  for (const voice of voices) {
    const vLang = (voice.lang || '').toLowerCase().replace(/_/g, '-');
    const vPrefix = voiceLangPrefix(vLang);
    const name = voice.name.toLowerCase();
    const hindiByName = wantsHindi && HINDI_VOICE_NAME.test(name);

    // Never cross primary language (e.g. en-* for hi-IN), unless Hindi name is explicit.
    if (vPrefix !== prefix && !hindiByName) continue;

    let score = 0;
    if (vLang === target) score += 130;
    else if (vLang === prefix || vLang.startsWith(`${prefix}-`)) score += 75;
    else if (hindiByName) score += 70;
    else continue;

    // Prefer exact product locales for DE/EN clients (Germany + English).
    if (wantsGerman && vLang === 'de-de') score += 40;
    if (wantsEnglish && target === 'en-us' && vLang === 'en-us') score += 36;
    if (wantsEnglish && target === 'en-gb' && vLang === 'en-gb') score += 36;
    if (wantsEnglish && target === 'en-us' && vLang === 'en-gb') score += 6;

    if (target === 'en-in') {
      if (vLang === 'en-in') score += 45;
      else if (vLang === 'en-gb') score += 8;
      else if (vLang === 'en-us') score -= 6;
    }

    if (PREMIUM_VOICE.test(name)) score += 55;
    if (GOOGLE_VOICE.test(name)) score += 72;
    if (MICROSOFT_NATURAL_VOICE.test(name)) score += 42;
    if (APPLE_NATURAL_VOICE.test(name)) score += 30;
    if (INDIAN_VOICE.test(name)) score += wantsIndianEnglish || wantsHindi ? 62 : 14;
    if (wantsHindi && HINDI_VOICE_NAME.test(name)) score += 80;
    if (wantsGerman && GERMAN_VOICE_NAME.test(name)) score += 48;
    if (wantsEnglish && ENGLISH_VOICE_NAME.test(name)) score += 28;
    if (FEMALE_VOICE.test(name)) score += 32;
    if (/google us english|google uk english|google deutsch|google german|google हिन्दी/.test(name)) {
      score += 16;
    }
    if (/male|man|david|guy|prabhat|rahul|conrad|yannick|stefan/.test(name)) score -= 10;
    if (/samantha|daniel|karen|moira|tessa|alex|ava|allison|serena/.test(name)) score += 28;
    // Prefer local voices — they usually emit onboundary (needed for word highlight).
    // Stronger boost for DE/EN (primary customer locales).
    if (voice.localService === true) score += wantsGerman || wantsEnglish ? 70 : 40;
    if (voice.localService === false) score -= wantsGerman || wantsEnglish ? 24 : 12;
    if (LOW_QUALITY_VOICE.test(name)) score -= 90;
    if (voice.default && score < 95) score -= 8;

    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }

  return best;
}

/** Estimated spoken duration for boundary-absent highlight sync. */
export function estimateUtteranceDurationMs(
  text: string,
  rate: number,
  language?: string | null,
): number {
  const words = (text.match(/\S+/g) || []).length;
  if (words <= 0) return 800;
  const baseWpm = baseWordsPerMinuteForLanguage(language);
  const wpm = baseWpm * Math.max(0.5, rate || 1);
  // Tiny bias so timed highlight stays with the voice without racing ahead.
  const DURATION_BIAS = 1.03;
  return Math.max(800, Math.round((words / wpm) * 60_000 * DURATION_BIAS));
}

/** Spoken WPM baseline — dense/script languages are slower per whitespace token. */
export function baseWordsPerMinuteForLanguage(language?: string | null): number {
  const locale = String(language || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  const primary = locale.split('-', 1)[0] || '';
  if (
    primary === 'hi' ||
    primary === 'bn' ||
    primary === 'ta' ||
    primary === 'te' ||
    primary === 'mr' ||
    primary === 'gu' ||
    primary === 'kn' ||
    primary === 'ml' ||
    primary === 'pa'
  ) {
    return 120;
  }
  if (primary === 'zh' || primary === 'ja' || primary === 'ko' || primary === 'ar' || primary === 'th') {
    return 105;
  }
  // European locales often lack reliable onboundary — timed sync fills gaps.
  if (
    primary === 'de' ||
    primary === 'fr' ||
    primary === 'es' ||
    primary === 'it' ||
    primary === 'nl' ||
    primary === 'pl' ||
    primary === 'tr' ||
    primary === 'ru'
  ) {
    return 145;
  }
  return 160;
}

/** Delay applied to timed highlight so paint stays near the voice (not far behind). */
export const HIGHLIGHT_FALLBACK_LAG_MS = 45;

/** Local spoken-word index for timed fallback (0-based, clamped, lightly lagged). */
export function fallbackLocalWordIndex(
  elapsedMs: number,
  durationMs: number,
  wordCount: number,
): number {
  if (wordCount <= 0) return 0;
  if (durationMs <= 0) return wordCount - 1;
  const laggedElapsed = Math.max(0, elapsedMs - HIGHLIGHT_FALLBACK_LAG_MS);
  const progress = Math.min(1, Math.max(0, laggedElapsed / durationMs));
  return Math.min(wordCount - 1, Math.floor(progress * wordCount));
}

/**
 * Cap timed fallback so it never jumps more than one spoken word ahead of the
 * last painted local index (prevents multi-word overshoot when estimates are high).
 */
export function clampFallbackWordAdvance(targetLocal: number, lastLocal: number): number {
  if (targetLocal <= lastLocal) return lastLocal;
  return Math.min(targetLocal, lastLocal + 1);
}

export function resolveVoiceProsody(
  language?: string | null,
): { rate: number; pitch: number; volume: number } {
  const locale = toSpeechLocale(language).toLowerCase();
  const base = {
    rate: PROFESSIONAL_TTS.rate,
    pitch: PROFESSIONAL_TTS.pitch,
    volume: PROFESSIONAL_TTS.volume,
  };
  if (locale.startsWith('hi')) return { rate: 0.93, pitch: 1.12, volume: 0.84 };
  if (locale.startsWith('en-in')) return { rate: 0.93, pitch: 1.1, volume: 0.85 };
  if (locale.startsWith('en')) return { rate: 0.94, pitch: 1.08, volume: 0.86 };
  if (locale.startsWith('de') || locale.startsWith('fr')) {
    return { rate: 0.93, pitch: 1.06, volume: 0.85 };
  }
  if (locale.startsWith('ar') || locale.startsWith('zh')) {
    return { rate: 0.92, pitch: 1.05, volume: 0.85 };
  }
  return { ...base, pitch: 1.06 };
}

export function waitForSpeechVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    let settled = false;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', onChange);
      resolve(voices);
    };
    const read = () => synth.getVoices().filter((voice) => Boolean(voice.lang));
    const onChange = () => {
      const loaded = read();
      if (loaded.length) finish(loaded);
    };
    const initial = read();
    if (initial.length) {
      finish(initial);
      return;
    }
    synth.addEventListener('voiceschanged', onChange);
    synth.getVoices();
    window.setTimeout(() => finish(read()), timeoutMs);
  });
}

export function createRecognizer(): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}
