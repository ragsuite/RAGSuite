export function truncateConversationId(id: string, head = 8, tail = 4): string {
  const value = (id || '').trim();
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
