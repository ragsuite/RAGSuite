type Listener = () => void;

const networkUnavailableListeners = new Set<Listener>();
const networkRestoredListeners = new Set<Listener>();

let consecutiveNetworkFailures = 0;
let isUnavailable = false;

export function getIsApiUnavailable(): boolean {
  return isUnavailable;
}

export function getConsecutiveNetworkFailures(): number {
  return consecutiveNetworkFailures;
}

/** Call when an Axios request gets no response (backend down / offline). */
export function notifyApiUnreachable(): void {
  consecutiveNetworkFailures += 1;
  // Require a few hard failures so a single slow/timed-out endpoint (e.g. coverage
  // under a large crawl) does not flash the global offline overlay.
  if (!isUnavailable && consecutiveNetworkFailures >= 3) {
    isUnavailable = true;
    networkUnavailableListeners.forEach((listener) => listener());
  }
}

/** Call when any API request succeeds again. */
export function notifyApiReachable(): void {
  consecutiveNetworkFailures = 0;
  if (isUnavailable) {
    isUnavailable = false;
    networkRestoredListeners.forEach((listener) => listener());
  }
}

export function onApiUnavailable(listener: Listener): () => void {
  networkUnavailableListeners.add(listener);
  return () => networkUnavailableListeners.delete(listener);
}

export function onApiRestored(listener: Listener): () => void {
  networkRestoredListeners.add(listener);
  return () => networkRestoredListeners.delete(listener);
}

/** Test helper / manual reset after successful health probe. */
export function resetApiReachabilityState(): void {
  consecutiveNetworkFailures = 0;
  isUnavailable = false;
}
