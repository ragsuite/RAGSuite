import { Platform } from 'react-native';

import { storage } from '@/services/storage/storage';

/** Matches reference EmbeddableWidget `SCROLL_POSITION_KEY`. */
export const APP_CHAT_WIDGET_SCROLL_POSITION_KEY = 'embeddable-widget-scroll-position';

const memoryPosition = new Map<string, number>();

export function readScrollPositionSync(key = APP_CHAT_WIDGET_SCROLL_POSITION_KEY): number | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return null;
      const value = parseInt(raw, 10);
      return Number.isFinite(value) && value >= 0 ? value : null;
    } catch {
      return memoryPosition.get(key) ?? null;
    }
  }
  return memoryPosition.get(key) ?? null;
}

export async function hydrateScrollPosition(
  key = APP_CHAT_WIDGET_SCROLL_POSITION_KEY,
): Promise<number | null> {
  if (Platform.OS === 'web') {
    return readScrollPositionSync(key);
  }
  try {
    const raw = await storage.getItem(key);
    if (raw == null) return null;
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) return null;
    memoryPosition.set(key, value);
    return value;
  } catch {
    return memoryPosition.get(key) ?? null;
  }
}

export function writeScrollPosition(position: number, key = APP_CHAT_WIDGET_SCROLL_POSITION_KEY): void {
  if (!Number.isFinite(position) || position < 0) return;
  memoryPosition.set(key, position);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, String(Math.round(position)));
    } catch {
      // ignore
    }
    return;
  }
  void storage.setItem(key, String(Math.round(position))).catch(() => {
    // ignore
  });
}

export function clearScrollPosition(key = APP_CHAT_WIDGET_SCROLL_POSITION_KEY): void {
  memoryPosition.delete(key);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  void storage.removeItem(key).catch(() => {
    // ignore
  });
}
