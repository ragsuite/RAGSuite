import {
  isAdminActivityDetail,
  notifyAdminActivity,
  subscribeAdminActivity,
  type AdminActivityDetail,
} from '@/shared/utils/admin-activity-sync';

type FakeChannel = {
  name: string;
  closed: boolean;
  listeners: Set<(event: MessageEvent) => void>;
  postMessage: (data: unknown) => void;
  close: () => void;
  addEventListener: (type: string, fn: (event: MessageEvent) => void) => void;
  removeEventListener: (type: string, fn: (event: MessageEvent) => void) => void;
};

const channels: FakeChannel[] = [];
const posted: unknown[] = [];

function installFakeBroadcastChannel() {
  const Fake = jest.fn().mockImplementation((name: string) => {
    const channel: FakeChannel = {
      name,
      closed: false,
      listeners: new Set(),
      postMessage: (data) => {
        posted.push(data);
        for (const other of channels) {
          if (other === channel || other.closed || other.name !== name) continue;
          other.listeners.forEach((fn) => fn({ data } as MessageEvent));
        }
      },
      close: () => {
        channel.closed = true;
      },
      addEventListener: (_type, fn) => channel.listeners.add(fn),
      removeEventListener: (_type, fn) => channel.listeners.delete(fn),
    };
    channels.push(channel);
    return channel;
  });
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    writable: true,
    value: Fake,
  });
}

const originalBroadcastChannel = globalThis.BroadcastChannel;
const windowTarget = new EventTarget();
const originalWindowFns = {
  addEventListener: window.addEventListener,
  removeEventListener: window.removeEventListener,
  dispatchEvent: window.dispatchEvent,
};

beforeEach(() => {
  channels.length = 0;
  posted.length = 0;
  installFakeBroadcastChannel();
  window.addEventListener = windowTarget.addEventListener.bind(windowTarget) as typeof window.addEventListener;
  window.removeEventListener = windowTarget.removeEventListener.bind(
    windowTarget,
  ) as typeof window.removeEventListener;
  window.dispatchEvent = windowTarget.dispatchEvent.bind(windowTarget);
});

afterEach(() => {
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    writable: true,
    value: originalBroadcastChannel,
  });
  window.addEventListener = originalWindowFns.addEventListener;
  window.removeEventListener = originalWindowFns.removeEventListener;
  window.dispatchEvent = originalWindowFns.dispatchEvent;
});

describe('isAdminActivityDetail', () => {
  it('validates kind, type and optional ids', () => {
    expect(isAdminActivityDetail({ kind: 'chatbot', type: 'query' })).toBe(true);
    expect(isAdminActivityDetail({ kind: 'search', type: 'feedback', projectId: 'p1' })).toBe(true);
    expect(isAdminActivityDetail({ kind: 'other', type: 'query' })).toBe(false);
    expect(isAdminActivityDetail({ kind: 'chatbot', type: 'query', sessionId: 4 })).toBe(false);
    expect(isAdminActivityDetail(null)).toBe(false);
  });
});

describe('notifyAdminActivity / subscribeAdminActivity', () => {
  it('delivers once in the same window and posts to other tabs', () => {
    const received: AdminActivityDetail[] = [];
    const unsubscribe = subscribeAdminActivity((detail) => received.push(detail));

    notifyAdminActivity({ kind: 'chatbot', type: 'query', projectId: ' p1 ', sessionId: 's1' });

    expect(received).toEqual([{ kind: 'chatbot', type: 'query', projectId: 'p1', sessionId: 's1' }]);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: 'chatbot', type: 'query', projectId: 'p1' });
    unsubscribe();
  });

  it('delivers BroadcastChannel messages from another window', () => {
    const received: AdminActivityDetail[] = [];
    const unsubscribe = subscribeAdminActivity((detail) => received.push(detail));
    const foreign = new BroadcastChannel('ragsuite:admin-activity');

    foreign.postMessage({ kind: 'search', type: 'feedback', projectId: 'p2', sourceId: 'other-tab' });

    expect(received).toEqual([{ kind: 'search', type: 'feedback', projectId: 'p2' }]);
    unsubscribe();
  });

  it('stops delivering after unsubscribe and closes its channel', () => {
    const received: AdminActivityDetail[] = [];
    const unsubscribe = subscribeAdminActivity((detail) => received.push(detail));
    const subscriberChannel = channels[0];
    unsubscribe();

    notifyAdminActivity({ kind: 'chatbot', type: 'feedback' });

    expect(received).toEqual([]);
    expect(subscriberChannel.closed).toBe(true);
  });
});
