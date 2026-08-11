import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memoryStore = new Map<string, string>();
const isWeb = Platform.OS === 'web';
const WEB_STORAGE_PREFIX = 'ragsuite.';

function getWebStorage() {
  if (!isWeb || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getWebKey(key: string) {
  return `${WEB_STORAGE_PREFIX}${key}`;
}

export const storage = {
  async getItem(key: string) {
    if (isWeb) {
      const webStorage = getWebStorage();
      if (webStorage) {
        return webStorage.getItem(getWebKey(key));
      }
      return memoryStore.get(key) ?? null;
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (isWeb) {
      const webStorage = getWebStorage();
      if (webStorage) {
        webStorage.setItem(getWebKey(key), value);
        return;
      }
      memoryStore.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    if (isWeb) {
      const webStorage = getWebStorage();
      if (webStorage) {
        webStorage.removeItem(getWebKey(key));
        return;
      }
      memoryStore.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
