import { Platform } from 'react-native';

import { AUTH_STORAGE_KEY, COOKIE_SESSION_TOKEN } from '@/features/auth/auth.constants';
import type { AuthSession } from '@/features/auth/auth.types';
import { storage } from '@/services/storage/storage';

let cachedAccessToken: string | null = null;
let isBootstrapping = false;
let cookieSessionActive = false;

export function isCookieSessionToken(token: string | null | undefined): boolean {
  return token === COOKIE_SESSION_TOKEN;
}

export function isWebCookieSessionActive(): boolean {
  return Platform.OS === 'web' && cookieSessionActive;
}

export function getAccessToken(): string | null {
  if (isCookieSessionToken(cachedAccessToken)) {
    return null;
  }
  return cachedAccessToken;
}

export function setAccessToken(token: string | null): void {
  cachedAccessToken = token;
  cookieSessionActive = isCookieSessionToken(token);
}

export function setAuthBootstrapping(value: boolean): void {
  isBootstrapping = value;
}

export function isAuthBootstrapping(): boolean {
  return isBootstrapping;
}

export async function hydrateAuthTokenFromStorage(): Promise<string | null> {
  try {
    const raw = await storage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      cachedAccessToken = null;
      cookieSessionActive = false;
      return null;
    }

    const session = JSON.parse(raw) as AuthSession;
    cachedAccessToken = session.accessToken ?? null;
    cookieSessionActive = isCookieSessionToken(cachedAccessToken);
    return isCookieSessionToken(cachedAccessToken) ? COOKIE_SESSION_TOKEN : cachedAccessToken;
  } catch {
    cachedAccessToken = null;
    cookieSessionActive = false;
    return null;
  }
}

export async function clearAuthSession(): Promise<void> {
  cachedAccessToken = null;
  cookieSessionActive = false;
  await storage.removeItem(AUTH_STORAGE_KEY);
}
