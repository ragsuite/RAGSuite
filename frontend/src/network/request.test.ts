import {
  getConsecutiveNetworkFailures,
  resetApiReachabilityState,
} from '@/network/api-reachability';
import { get } from '@/network/request';

describe('request reachability', () => {
  beforeEach(() => {
    resetApiReachabilityState();
  });

  it('does not count cancelled requests as server outages', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(get('/api/v1/health', { signal: controller.signal })).rejects.toBeTruthy();
    await expect(get('/api/v1/health', { signal: controller.signal })).rejects.toBeTruthy();
    await expect(get('/api/v1/health', { signal: controller.signal })).rejects.toBeTruthy();

    expect(getConsecutiveNetworkFailures()).toBe(0);
  });
});
