import { createLiveRefreshScheduler } from '@/shared/hooks/live-refresh-scheduler';

async function flushPromises() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe('createLiveRefreshScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refreshes after the debounce and again after the follow-up', async () => {
    const refresh = jest.fn(() => Promise.resolve());
    const scheduler = createLiveRefreshScheduler({ refresh, debounceMs: 500, followUpMs: 2500 });

    scheduler.trigger();
    jest.advanceTimersByTime(499);
    expect(refresh).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await flushPromises();

    jest.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('coalesces a burst of events into one debounce + one follow-up', async () => {
    const refresh = jest.fn(() => Promise.resolve());
    const scheduler = createLiveRefreshScheduler({ refresh, debounceMs: 500, followUpMs: 2500 });

    scheduler.trigger();
    jest.advanceTimersByTime(200);
    scheduler.trigger();
    jest.advanceTimersByTime(200);
    scheduler.trigger();
    jest.advanceTimersByTime(500);
    expect(refresh).toHaveBeenCalledTimes(1);
    await flushPromises();

    jest.advanceTimersByTime(2500);
    expect(refresh).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('never overlaps runs and replays one queued run afterwards', async () => {
    let resolveFirst: () => void = () => undefined;
    const refresh = jest
      .fn<Promise<void>, []>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementation(() => Promise.resolve());
    const scheduler = createLiveRefreshScheduler({ refresh });

    scheduler.runNow();
    scheduler.runNow();
    scheduler.runNow();
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveFirst();
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('swallows refresh errors and stops after dispose', async () => {
    const refresh = jest.fn(() => Promise.reject(new Error('offline')));
    const scheduler = createLiveRefreshScheduler({ refresh, debounceMs: 100, followUpMs: 200 });

    scheduler.runNow();
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.trigger();
    scheduler.dispose();
    jest.advanceTimersByTime(1000);
    scheduler.runNow();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
