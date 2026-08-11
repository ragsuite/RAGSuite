import {
  diffBrowserNotifications,
  formatBrowserNotificationBody,
  type BrowserNotificationItem,
} from '@/features/notifications/utils/browser-notification-diff';

describe('browser-notification-diff', () => {
  const sample: BrowserNotificationItem[] = [
    { id: 'a', title: 'A', message: 'first', type: 'info', read: false },
    { id: 'b', title: 'B', message: 'second', type: 'success', read: false },
    { id: 'c', title: 'C', message: 'third', type: 'error', read: true },
  ];

  it('skips OS toasts on first hydrate and seeds known unread ids', () => {
    const result = diffBrowserNotifications({
      initialized: false,
      unreadCount: 2,
      previousCount: -1,
      previousIds: new Set(),
      notifications: sample,
    });

    expect(result.shouldInitializeOnly).toBe(true);
    expect(result.newNotifications).toEqual([]);
    expect(Array.from(result.nextUnreadIds).sort()).toEqual(['a', 'b']);
  });

  it('returns only newly unread notifications (max 3)', () => {
    const result = diffBrowserNotifications({
      initialized: true,
      unreadCount: 3,
      previousCount: 2,
      previousIds: new Set(['a']),
      notifications: [
        ...sample,
        { id: 'd', title: 'D', message: 'fourth', type: 'warning', read: false },
        { id: 'e', title: 'E', message: 'fifth', type: 'info', read: false },
      ],
    });

    expect(result.shouldInitializeOnly).toBe(false);
    expect(result.newNotifications.map((item) => item.id)).toEqual(['b', 'd', 'e']);
  });

  it('truncates and capitalizes notification body', () => {
    const long = 'a'.repeat(130);
    expect(formatBrowserNotificationBody(long).length).toBe(120);
    expect(formatBrowserNotificationBody(' hello')).toBe('Hello');
  });
});
