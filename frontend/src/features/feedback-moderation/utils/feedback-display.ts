export function formatFeedbackTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatFeedbackLatencyMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms <= 0) return '—';
  return `${Math.round(ms)} ms`;
}

export function formatAvgResponseMs(ms: number): string {
  return String(Math.round(ms));
}

export function confidenceLabelFromScore(score: number | null | undefined): string | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 60) return 'High confidence';
  if (score >= 40) return 'Medium confidence';
  return 'Low confidence';
}

export function voteFromFeedback(feedback: boolean, rating: number): 'positive' | 'negative' {
  if (!feedback || rating <= 2) return 'negative';
  return 'positive';
}

export function feedbackMessageTypeLabel(messageType: 'chat' | 'search'): string {
  return messageType === 'search' ? 'Search' : 'Chat';
}
