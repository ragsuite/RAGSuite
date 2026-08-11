import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

function copyOnWebLegacy(text: string): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Copies text to the clipboard. Returns true when copy succeeded. */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (Platform.OS === 'web') {
    const nav = globalThis.navigator;
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(text);
        return true;
      } catch {
        return copyOnWebLegacy(text);
      }
    }
    return copyOnWebLegacy(text);
  }

  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
