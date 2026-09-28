import type { FaqEditorItem } from './faq-editor.types';

export function isFaqItemAnswerMissing(item: Pick<FaqEditorItem, 'answer'>): boolean {
  return !(item.answer ?? '').trim();
}

/** Re-number items 1..n in their current order. */
export function reorderFaqItems<T extends FaqEditorItem>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

export function createFaqItemId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
