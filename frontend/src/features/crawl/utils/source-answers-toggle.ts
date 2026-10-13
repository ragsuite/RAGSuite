export type SourceAnswersSave = (enabled: boolean) => Promise<boolean>;

/**
 * Shows `next` while the save is in flight, then clears the override so the
 * saved bundle value wins (the new value on success, the previous one on failure).
 */
export async function commitSourceAnswersToggle(
  next: boolean,
  save: SourceAnswersSave,
  show: (value: boolean | null) => void,
): Promise<boolean> {
  show(next);
  try {
    return await save(next);
  } catch {
    return false;
  } finally {
    show(null);
  }
}
