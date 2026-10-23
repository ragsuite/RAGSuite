export const PROMPT_TEMPLATES = ['helpful', 'strict', 'faq'] as const;
export type PromptTemplate = (typeof PROMPT_TEMPLATES)[number];

export const PROMPT_TEMPLATE_TEXT: Record<PromptTemplate, string> = {
  helpful:
    'You are a helpful AI chatbot. Use ONLY the context below to answer questions.\nIf the information is not in the context, say so. Be concise and accurate.',
  strict:
    'You are a strict, sources-only assistant. Answer only from the provided documents.\nDo not invent facts, names, numbers, or policies. If the documents do not contain the answer, say so briefly.',
  faq:
    'You are a concise FAQ assistant. Give short, direct answers from the documents.\nPrefer one or two sentences. If the documents do not contain the answer, say so briefly.',
};

export function normalizePromptTemplate(value: string | null | undefined): PromptTemplate {
  const raw = (value || 'helpful').trim().toLowerCase();
  return (PROMPT_TEMPLATES as readonly string[]).includes(raw) ? (raw as PromptTemplate) : 'helpful';
}
