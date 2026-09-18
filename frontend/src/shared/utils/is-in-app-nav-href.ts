/** True for Expo app routes emitted by AI Assistant Ops how-tos. */
export function isInAppNavHref(href: string): boolean {
  const trimmed = (href || '').trim();
  return trimmed.startsWith('/(app)/') || trimmed === '/(app)';
}
