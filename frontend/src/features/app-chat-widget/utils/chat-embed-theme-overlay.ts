import type {
  ChatWidgetConfig,
  ChatWidgetCustomization,
} from '@/features/chatbot-config/types/chatbot-config.types';

/** Customization keys accepted in host `theme` postMessage (CEO §5.5). */
export const CHAT_EMBED_CUSTOMIZATION_OVERLAY_KEYS = [
  'primaryColor',
  'secondaryColor',
  'headerColor',
  'backgroundColor',
  'textColor',
  'logoUrl',
  'avatarUrl',
  'avatarId',
] as const;

/** Config keys accepted in the same `theme` object for host simplicity. */
export const CHAT_EMBED_CONFIG_OVERLAY_KEYS = [
  'launcherLabel',
  'bubbleMessage',
  'accentColor',
] as const;

/** @deprecated Prefer CHAT_EMBED_CUSTOMIZATION_OVERLAY_KEYS */
export const CHAT_EMBED_THEME_OVERLAY_KEYS = CHAT_EMBED_CUSTOMIZATION_OVERLAY_KEYS;

export type ChatEmbedCustomizationOverlayKey =
  (typeof CHAT_EMBED_CUSTOMIZATION_OVERLAY_KEYS)[number];
export type ChatEmbedConfigOverlayKey = (typeof CHAT_EMBED_CONFIG_OVERLAY_KEYS)[number];

export type ChatEmbedThemeOverlay = Partial<
  Pick<ChatWidgetCustomization, ChatEmbedCustomizationOverlayKey>
>;
/** Config overlay — bubbleMessage may be cleared with null / empty string. */
export type ChatEmbedConfigOverlay = {
  launcherLabel?: string;
  bubbleMessage?: string | null;
  accentColor?: string;
};

export type ParsedChatEmbedThemeMessage = {
  customization: ChatEmbedThemeOverlay;
  config: ChatEmbedConfigOverlay;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assignNullableStringField<T extends string>(
  out: Partial<Record<T, string | null>>,
  key: T,
  value: unknown,
  allowNull: boolean,
): void {
  if (allowNull && value === null) {
    out[key] = null;
    return;
  }
  if (isNonEmptyString(value)) {
    out[key] = value.trim();
  }
}

/** Parse a parent postMessage payload into whitelisted customization + config overlays. */
export function parseChatEmbedThemeMessage(data: unknown): ParsedChatEmbedThemeMessage | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== 'ragsuite-chatbot-host' || msg.type !== 'theme') return null;
  const theme = msg.theme;
  if (!theme || typeof theme !== 'object') return null;
  const raw = theme as Record<string, unknown>;

  const customization: ChatEmbedThemeOverlay = {};
  for (const key of CHAT_EMBED_CUSTOMIZATION_OVERLAY_KEYS) {
    const allowNull = key === 'logoUrl' || key === 'avatarUrl';
    assignNullableStringField(customization, key, raw[key], allowNull);
  }

  const config: ChatEmbedConfigOverlay = {};
  for (const key of CHAT_EMBED_CONFIG_OVERLAY_KEYS) {
    if (key === 'bubbleMessage') {
      if (raw.bubbleMessage === null || raw.bubbleMessage === '') {
        config.bubbleMessage = null;
      } else if (isNonEmptyString(raw.bubbleMessage)) {
        config.bubbleMessage = raw.bubbleMessage.trim();
      }
      continue;
    }
    if (isNonEmptyString(raw[key])) {
      config[key] = raw[key].trim();
    }
  }

  if (Object.keys(customization).length === 0 && Object.keys(config).length === 0) {
    return null;
  }
  return { customization, config };
}

export function mergeChatEmbedThemeOverlay(
  base: ChatWidgetCustomization | null | undefined,
  overlay: ChatEmbedThemeOverlay | null | undefined,
): ChatWidgetCustomization | null {
  if (!base) return null;
  if (!overlay || Object.keys(overlay).length === 0) return base;
  return { ...base, ...overlay };
}

export function mergeChatEmbedConfigOverlay(
  base: ChatWidgetConfig | null | undefined,
  overlay: ChatEmbedConfigOverlay | null | undefined,
): ChatWidgetConfig | null {
  if (!base) return null;
  if (!overlay || Object.keys(overlay).length === 0) return base;
  const next: ChatWidgetConfig = { ...base };
  if (overlay.launcherLabel !== undefined) next.launcherLabel = overlay.launcherLabel;
  if (overlay.accentColor !== undefined) next.accentColor = overlay.accentColor;
  if (overlay.bubbleMessage !== undefined) {
    next.bubbleMessage = overlay.bubbleMessage == null ? '' : overlay.bubbleMessage;
  }
  return next;
}
