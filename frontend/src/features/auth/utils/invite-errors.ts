export function resolveInviteErrorMessage(error: unknown, t: (key: string) => string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: { detail?: string } } }).response;
    const detail = response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (response?.status === 410) {
      return t('inviteSetup.errors.expired');
    }
    if (response?.status === 409) {
      return t('inviteSetup.errors.alreadyCompleted');
    }
    if (response?.status === 404) {
      return t('inviteSetup.errors.invalid');
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return t('inviteSetup.errors.generic');
}
