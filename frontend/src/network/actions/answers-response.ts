/** Saved "Use in answers" flag of a toggle response; throws when the response carries none. */
export function readUseInAnswers(response: unknown): boolean {
  const record = response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
  const data = record?.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record;
  if (typeof data?.use_in_answers !== 'boolean') {
    throw new Error('crawl.table.answers.toast.failed');
  }
  return data.use_in_answers;
}
