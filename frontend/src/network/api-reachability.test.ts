import {
  getConsecutiveNetworkFailures,
  getIsApiUnavailable,
  notifyApiReachable,
  notifyApiUnreachable,
  onApiRestored,
  onApiUnavailable,
  resetApiReachabilityState,
} from '@/network/api-reachability';

describe('api-reachability', () => {
  beforeEach(() => {
    resetApiReachabilityState();
  });

  it('marks API unavailable after repeated network failures and restores on success', () => {
    expect(getIsApiUnavailable()).toBe(false);

    let unavailable = 0;
    let restored = 0;

    const offU = onApiUnavailable(() => {
      unavailable += 1;
    });
    const offR = onApiRestored(() => {
      restored += 1;
    });

    notifyApiUnreachable();
    expect(getIsApiUnavailable()).toBe(false);
    expect(getConsecutiveNetworkFailures()).toBe(1);
    expect(unavailable).toBe(0);

    notifyApiUnreachable();
    expect(getIsApiUnavailable()).toBe(false);
    expect(unavailable).toBe(0);

    notifyApiUnreachable();
    expect(getIsApiUnavailable()).toBe(true);
    expect(getConsecutiveNetworkFailures()).toBe(3);
    expect(unavailable).toBe(1);

    notifyApiUnreachable();
    expect(unavailable).toBe(1);

    notifyApiReachable();
    expect(getIsApiUnavailable()).toBe(false);
    expect(getConsecutiveNetworkFailures()).toBe(0);
    expect(restored).toBe(1);

    offU();
    offR();
  });
});
