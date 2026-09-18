/**
 * Background wash for the active TTS word.
 * Uses the text color's luminance so the highlight stays visible on both
 * dark bubbles (light text → light wash) and light bubbles (dark text → dark wash).
 */
export function resolveSpeechHighlightWash(textColor: string): string {
  const raw = (textColor || '').trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  let r = 0;
  let g = 0;
  let b = 0;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (raw.startsWith('rgb')) {
    const m = raw.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      r = Number(m[1]);
      g = Number(m[2]);
      b = Number(m[3]);
    }
  } else {
    // Unknown color — prefer light wash (common for dark chat themes).
    return 'rgba(255, 255, 255, 0.34)';
  }

  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  // Light text on dark surfaces → light highlight; dark text → dark highlight.
  return luminance > 0.55 ? 'rgba(255, 255, 255, 0.34)' : 'rgba(0, 0, 0, 0.16)';
}
