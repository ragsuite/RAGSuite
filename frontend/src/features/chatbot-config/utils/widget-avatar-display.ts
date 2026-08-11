import type {
  AvatarOption,
  ChatWidgetCustomization,
} from '@/features/chatbot-config/types/chatbot-config.types';
import { env } from '@/config/env';
import { buildApiUrl } from '@/network/apiUrl';

const PRESET_AVATAR_ID = /^default-\d+$/i;
const AVATAR_FILENAME = /avatar-(\d+)\.(png|jpe?g|webp|gif|svg)$/i;

function apiV1BaseUrl(): string {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
}

/** Resolve preset avatar asset URLs to absolute API URLs (matches reference widgetAPI.getAvatars). */
export function resolveAvatarAssetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;

  const trimmed = url.trim();
  if (/^(https?:|data:|file:)/i.test(trimmed)) return trimmed;

  const apiBase = apiV1BaseUrl();

  if (trimmed.startsWith('/api/v1/')) {
    const origin = apiBase.replace(/\/api\/v1$/, '');
    return `${origin}${trimmed}`;
  }

  if (trimmed.startsWith('/avatars/')) {
    return `${apiBase}${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    return buildApiUrl(trimmed);
  }

  return `${apiBase}/avatars/${trimmed}`;
}

export function isPersistableCustomAvatarUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const trimmed = value.trim();
  return /^(data:|https?:|file:)/i.test(trimmed);
}

export function extractPresetAvatarId(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (PRESET_AVATAR_ID.test(trimmed)) return trimmed.toLowerCase();

  const filename = trimmed.split('/').pop()?.split('?')[0] ?? trimmed;
  const match = filename.match(AVATAR_FILENAME);
  if (match) return `default-${match[1]}`;

  return null;
}

export function mapWidgetAvatarFromApi(
  widgetAvatar: string | null | undefined,
  fallbackAvatarId = 'default-1',
): Pick<ChatWidgetCustomization, 'avatarId' | 'avatarUrl'> {
  if (widgetAvatar == null) {
    return { avatarId: fallbackAvatarId, avatarUrl: null };
  }

  const raw = widgetAvatar.trim();
  if (!raw || raw === 'custom') {
    return { avatarId: 'default-1', avatarUrl: null };
  }

  const presetId = extractPresetAvatarId(raw);
  if (presetId) {
    return { avatarId: presetId, avatarUrl: null };
  }

  if (isPersistableCustomAvatarUrl(raw)) {
    return { avatarId: 'custom', avatarUrl: resolveAvatarAssetUrl(raw) ?? raw };
  }

  return { avatarId: raw, avatarUrl: null };
}

export function resolveWidgetAvatarForApi(customization: ChatWidgetCustomization): string {
  const url = customization.avatarUrl?.trim() ?? '';
  if (url) {
    if (isPersistableCustomAvatarUrl(url)) return url;
    const presetFromUrl = extractPresetAvatarId(url);
    if (presetFromUrl) return presetFromUrl;
  }

  const id = customization.avatarId?.trim() ?? '';
  if (id && id !== 'custom') {
    return extractPresetAvatarId(id) ?? id;
  }

  return 'default-1';
}

export async function readImageUriAsDataUrl(uri: string): Promise<string> {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('data:')) return trimmed;
  if (typeof fetch !== 'function' || typeof FileReader === 'undefined') {
    return trimmed;
  }

  const response = await fetch(trimmed);
  if (!response.ok) {
    throw new Error('Could not read the selected avatar image.');
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? trimmed));
    reader.onerror = () => reject(new Error('Could not encode the selected avatar image.'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareChatWidgetCustomizationForSave(
  customization: ChatWidgetCustomization,
): Promise<ChatWidgetCustomization> {
  const avatarUrl = customization.avatarUrl?.trim() ?? '';
  if (!avatarUrl || isPersistableCustomAvatarUrl(avatarUrl)) {
    return customization;
  }

  const dataUrl = await readImageUriAsDataUrl(avatarUrl);
  return {
    ...customization,
    avatarId: 'custom',
    avatarUrl: dataUrl,
  };
}

export function resolveWidgetAvatarUrl(
  avatarId: string,
  avatarUrl: string | null | undefined,
  avatarOptions: AvatarOption[] | null | undefined,
): string | null {
  if (avatarUrl?.trim()) {
    const trimmed = avatarUrl.trim();
    return resolveAvatarAssetUrl(trimmed) ?? trimmed;
  }
  const preset = avatarOptions?.find((option) => option.id === avatarId);
  if (preset?.url) return resolveAvatarAssetUrl(preset.url) ?? preset.url;
  if (avatarId && avatarId !== 'custom') {
    return resolveAvatarAssetUrl(avatarId);
  }
  return null;
}

/** Merge resolved preset/custom avatar URL into customization for widget display. */
export function withResolvedWidgetAvatarCustomization(
  customization: ChatWidgetCustomization,
  avatarOptions: AvatarOption[] | null | undefined,
): ChatWidgetCustomization {
  const resolvedUrl = resolveWidgetAvatarUrl(
    customization.avatarId,
    customization.avatarUrl,
    avatarOptions,
  );
  if (!resolvedUrl || resolvedUrl === customization.avatarUrl) {
    return customization;
  }
  return { ...customization, avatarUrl: resolvedUrl };
}
