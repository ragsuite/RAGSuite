import { brandTokens } from '@/theme/brand-tokens';

function hslComponentsToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const hueToRgb = (offset: number) => {
    const k = (offset + h / 30) % 12;
    const color = lightness - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${hueToRgb(0)}${hueToRgb(8)}${hueToRgb(4)}`;
}

export function hexToHslComponents(hex: string): string | null {
  try {
    let normalized = hex.trim().toLowerCase();
    if (normalized.startsWith('hsl(')) {
      const inner = normalized.slice(4, -1).trim();
      return inner || null;
    }
    if (!normalized.startsWith('#')) return null;
    if (normalized.length === 4) {
      normalized = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
    }
    if (normalized.length !== 7) return null;

    const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
    const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
    const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hue = 0;
    let sat = 0;
    const light = (max + min) / 2;

    if (max !== min) {
      const delta = max - min;
      sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      switch (max) {
        case r:
          hue = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          hue = (b - r) / delta + 2;
          break;
        default:
          hue = (r - g) / delta + 4;
          break;
      }
      hue *= 60;
    }

    return `${Math.round(hue)} ${Math.round(sat * 100)}% ${Math.round(light * 100)}%`;
  } catch {
    return null;
  }
}

/** Same H+S as primary, lightness 98% — reference `bg-primary-tint`. */
export function derivePrimaryTintHex(primaryColor: string): string {
  const hsl = hexToHslComponents(primaryColor);
  if (!hsl) return brandTokens.color.pineTint;
  const match = hsl.match(/^(\d+)\s+(\d+)%\s+\d+%$/);
  if (!match) return brandTokens.color.pineTint;
  return hslComponentsToHex(Number(match[1]), Number(match[2]), 98);
}
