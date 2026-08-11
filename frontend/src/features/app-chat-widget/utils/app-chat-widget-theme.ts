import type {
  ChatWidgetConfig,
  ChatWidgetCustomization,
} from '@/features/chatbot-config/types/chatbot-config.types';
import {
  getWidgetThemeColors,
  getRelativeLuminance,
  resolveSolidWidgetAccentColor,
  suggestTextColorForBackground,
} from '@/features/chatbot-config/utils/widget-theme-utils';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { brandTokens } from '@/theme/brand-tokens';
import { colors as themeColors } from '@/theme/colors';

const { color } = brandTokens;

function parseHexColor(
  input: string,
): { r: number; g: number; b: number } | null {
  const hex = input.trim().replace('#', '');
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function colorLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return 0.18;
  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function isLightWidgetColor(hex: string): boolean {
  return colorLuminance(hex) > 0.55;
}

function resolveSendIconActiveColor(inputBackground: string, accent: string): string {
  const accentLum = getRelativeLuminance(accent);
  const bgLum = getRelativeLuminance(inputBackground);
  if (Math.abs(accentLum - bgLum) < 0.12) {
    return isLightWidgetColor(inputBackground) ? color.pineBright : color.hairline;
  }
  return accent;
}

function ensureUserBubbleContrast(bubbleBg: string, panelBg: string): string {
  if (Math.abs(getRelativeLuminance(bubbleBg) - getRelativeLuminance(panelBg)) < 0.15) {
    return isLightWidgetColor(panelBg) ? color.pineBright : color.pineTint;
  }
  return bubbleBg;
}

function resolveHeaderTextColor(
  headerColor: string | null | undefined,
  solidAccentColor: string,
): string {
  const headerBg = headerColor?.trim();
  if (headerBg && parseHexColor(headerBg)) {
    return suggestTextColorForBackground(headerBg);
  }
  return suggestTextColorForBackground(solidAccentColor);
}

export type AppChatWidgetTheme = {
  accentColor: string;
  accentForegroundColor: string;
  userBubbleBg: string;
  userBubbleTextColor: string;
  panelBg: string;
  panelBorderColor: string;
  heroTitleColor: string;
  heroSubtitleColor: string;
  assistantBubbleBg: string;
  assistantTextColor: string;
  assistantErrorBg: string;
  assistantErrorText: string;
  inputSectionBg: string;
  inputTextColor: string;
  inputBorderColor: string;
  sendBorderColor: string;
  placeholderColor: string;
  metaColor: string;
  disclaimerColor: string;
  launcherBg: string;
  avatarBg: string;
  headerTextColor: string;
  starColor: string;
  errorAccent: string;
  sendIconColor: string;
  sendIconActiveColor: string;
  sendIconDisabledOpacity: number;
};

export function resolveAppChatWidgetTheme(
  config: ChatWidgetConfig,
  customization: ChatWidgetCustomization,
): AppChatWidgetTheme {
  const rawAccent =
    customization.primaryColor || config.accentColor || BRANDING_DEFAULTS.primaryColor;
  const solidAccentColor = resolveSolidWidgetAccentColor(rawAccent);
  const accentForegroundColor = suggestTextColorForBackground(solidAccentColor);
  const panelBg = customization.backgroundColor?.trim() || color.pineDeep;
  const textColor = customization.textColor?.trim() || undefined;
  const isLightPanel = isLightWidgetColor(panelBg);
  const userBubbleBg = ensureUserBubbleContrast(solidAccentColor, panelBg);
  const userBubbleTextColor = suggestTextColorForBackground(userBubbleBg);
  const headerTextColor = resolveHeaderTextColor(customization.headerColor, solidAccentColor);
  const inputSectionBgForSend: string = isLightPanel ? color.paperRaised : color.pineDeep;
  const inputTheme = getWidgetThemeColors(panelBg, textColor ?? color.paperRaised);
  const sendIconColor = inputTheme.mutedText;
  const sendIconActiveColor = resolveSendIconActiveColor(inputSectionBgForSend, solidAccentColor);
  const sendIconDisabledOpacity = 0.5;
  const sharedAccentTokens = {
    accentColor: solidAccentColor,
    accentForegroundColor,
    userBubbleBg,
    userBubbleTextColor,
    headerTextColor,
  };

  if (isLightPanel) {
    return {
      ...sharedAccentTokens,
      panelBg,
      panelBorderColor: color.hairline,
      heroTitleColor: textColor ?? color.ink,
      heroSubtitleColor: textColor ?? color.inkSoft,
      assistantBubbleBg: color.paperSunken,
      assistantTextColor: textColor ?? color.ink,
      assistantErrorBg: themeColors.light.dangerBackground,
      assistantErrorText: color.error,
      inputSectionBg: color.paperRaised,
      inputTextColor: color.ink,
      inputBorderColor: color.hairline,
      sendBorderColor: color.hairline,
      placeholderColor: color.inkFaint,
      metaColor: color.inkFaint,
      disclaimerColor: color.inkFaint,
      launcherBg: color.paperRaised,
      avatarBg: color.paperSunken,
      starColor: color.ochre,
      errorAccent: color.error,
      sendIconColor,
      sendIconActiveColor,
      sendIconDisabledOpacity,
    };
  }

  return {
    ...sharedAccentTokens,
    panelBg,
    panelBorderColor: themeColors.dark.border,
    heroTitleColor: textColor ?? color.paperRaised,
    heroSubtitleColor: textColor ?? color.hairline,
    assistantBubbleBg: color.pine,
    assistantTextColor: textColor ?? color.paperRaised,
    assistantErrorBg: themeColors.dark.dangerBackground,
    assistantErrorText: color.error,
    inputSectionBg: color.pineDeep,
    inputTextColor: color.paperRaised,
    inputBorderColor: themeColors.dark.border,
    sendBorderColor: themeColors.dark.border,
    placeholderColor: color.hairlineStrong,
    metaColor: color.hairline,
    disclaimerColor: color.hairlineStrong,
    launcherBg: color.paperRaised,
    avatarBg: color.paperRaised,
    starColor: color.ochre,
    errorAccent: color.error,
    sendIconColor,
    sendIconActiveColor,
    sendIconDisabledOpacity,
  };
}
