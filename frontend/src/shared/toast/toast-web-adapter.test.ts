import { getToastifyType, formatToastifyMessage, getToastifyDuration } from '@/shared/toast/toast-web-adapter';

describe('toast-web-adapter', () => {
  it('maps destructive variant to Toastify error type', () => {
    expect(getToastifyType('destructive')).toBe('error');
  });

  it('joins title and description for success toasts', () => {
    expect(formatToastifyMessage({ title: 'Saved', description: 'Configuration updated', variant: 'success' })).toBe(
      'Saved\nConfiguration updated',
    );
  });

  it('formats success description-only toasts without an extra title', () => {
    expect(formatToastifyMessage({ description: 'Message copied.', variant: 'success' })).toBe('Message copied.');
  });

  it('joins title and description for non-success toasts', () => {
    expect(formatToastifyMessage({ title: 'Connection failed', description: 'Try again.', variant: 'error' })).toBe(
      'Connection failed\nTry again.',
    );
  });

  it('defaults autoClose duration to 5000ms like the reference', () => {
    expect(getToastifyDuration({ description: 'Saved', variant: 'success' })).toBe(5000);
  });
});
