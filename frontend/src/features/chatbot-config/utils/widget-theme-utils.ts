import { brandTokens } from '@/theme/brand-tokens';

const { color } = brandTokens;

export const DEFAULT_GRADIENT_COLOR1 = color.pineBright;
export const DEFAULT_GRADIENT_COLOR2 = color.pine;
export const DEFAULT_GRADIENT_ANGLE = 135;
export const DEFAULT_WIDGET_CHATBOT_COLOR = color.pine;
export const DEFAULT_WIDGET_BACKGROUND = color.pineDeep;
export const DEFAULT_WIDGET_TEXT_COLOR = color.paperRaised;

type Rgb = { r: number; g: number; b: number };

function parseHexColor(colorValue: string): Rgb | null {
  const hex = colorValue.trim();
  if (!hex.startsWith('#')) return null;

  let value = hex.slice(1);
  if (value.length === 3) {
    value = value.split('').map((char) => char + char).join('');
  }
  if (value.length !== 6) return null;

  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;

  return { r, g, b };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mixColors(colorA: string, colorB: string, ratio: number): string {
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  if (!a || !b) return colorA;

  const weight = Math.max(0, Math.min(1, ratio));
  return toHex({
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight,
  });
}

export function getRelativeLuminance(colorValue: string): number {
  const rgb = parseHexColor(colorValue);
  if (!rgb) return 0;

  const normalize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  const r = normalize(rgb.r);
  const g = normalize(rgb.g);
  const b = normalize(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isLightBackground(colorValue: string): boolean {
  return getRelativeLuminance(colorValue) > 0.5;
}

export function suggestTextColorForBackground(background: string): string {
  return isLightBackground(background) ? color.ink : color.paperRaised;
}

export function getWidgetThemeColors(
  background: string = DEFAULT_WIDGET_BACKGROUND,
  textColor: string = DEFAULT_WIDGET_TEXT_COLOR,
) {
  const bg = parseHexColor(background) ? background : DEFAULT_WIDGET_BACKGROUND;
  const text = parseHexColor(textColor) ? textColor : DEFAULT_WIDGET_TEXT_COLOR;

  return {
    background: bg,
    text,
    surface: mixColors(bg, text, 0.12),
    border: mixColors(bg, text, 0.28),
    mutedText: mixColors(text, bg, 0.45),
    inputBackground: mixColors(bg, text, 0.06),
  };
}

export const CHATBOT_COLOR_SWATCHES = [
  { id: 'pine', value: color.pine, color: color.pine },
  { id: 'pine-bright', value: color.pineBright, color: color.pineBright },
  { id: 'ochre', value: color.ochre, color: color.ochre },
  { id: 'pine-deep', value: color.pineDeep, color: color.pineDeep },
  { id: 'gradient', value: 'gradient', gradient: [DEFAULT_GRADIENT_COLOR1, DEFAULT_GRADIENT_COLOR2] as const },
] as const;

export type ParsedCustomGradient = {
  angle: number;
  color1: string;
  color2: string;
};

export function parseCustomGradient(value: string): ParsedCustomGradient | null {
  if (!value.startsWith('linear-gradient')) return null;
  const match = value.match(/linear-gradient\((\d+)deg,\s*([^)]+)\)/);
  if (!match) return null;

  const angle = Number.parseInt(match[1], 10);
  const parts = match[2].split(',').map((part) => part.trim());
  const color1 = parts[0]?.split(' ')[0] ?? DEFAULT_GRADIENT_COLOR1;
  const color2 = parts[1]?.split(' ')[0] ?? DEFAULT_GRADIENT_COLOR2;

  return {
    angle: Number.isFinite(angle) ? angle : DEFAULT_GRADIENT_ANGLE,
    color1,
    color2,
  };
}

export function buildCustomGradientString(color1: string, color2: string, angle: number): string {
  return `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 100%)`;
}

export function resolveWidgetChatbotColor(primaryColor: string | null | undefined): string {
  return primaryColor?.trim() || DEFAULT_WIDGET_CHATBOT_COLOR;
}

/** Solid hex suitable for React Native backgroundColor (gradients are reduced to a stop). */
export function resolveSolidWidgetAccentColor(primaryColor: string | null | undefined): string {
  const raw = primaryColor?.trim() || DEFAULT_WIDGET_CHATBOT_COLOR;
  if (isDefaultGradientWidgetColor(raw)) return DEFAULT_WIDGET_CHATBOT_COLOR;
  if (isCustomGradientWidgetColor(raw)) {
    const parsed = parseCustomGradient(raw);
    const stop = parsed?.color1?.trim();
    return stop && parseHexColor(stop) ? stop : DEFAULT_WIDGET_CHATBOT_COLOR;
  }
  return parseHexColor(raw) ? raw : DEFAULT_WIDGET_CHATBOT_COLOR;
}

export function isDefaultGradientWidgetColor(colorValue: string): boolean {
  return colorValue === 'gradient';
}

export function isCustomGradientWidgetColor(colorValue: string): boolean {
  return colorValue.startsWith('linear-gradient');
}

export function resolvePreviewGradient(
  widgetChatbotColor: string,
  fallbackColor1: string,
  fallbackColor2: string,
  fallbackAngle: number,
): { color1: string; color2: string; angle: number } {
  if (isDefaultGradientWidgetColor(widgetChatbotColor)) {
    return {
      color1: DEFAULT_GRADIENT_COLOR1,
      color2: DEFAULT_GRADIENT_COLOR2,
      angle: DEFAULT_GRADIENT_ANGLE,
    };
  }

  if (isCustomGradientWidgetColor(widgetChatbotColor)) {
    const parsed = parseCustomGradient(widgetChatbotColor);
    if (parsed) return parsed;
  }

  return {
    color1: fallbackColor1,
    color2: fallbackColor2,
    angle: fallbackAngle,
  };
}
