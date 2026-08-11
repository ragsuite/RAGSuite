import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { InteractionManager, Platform } from 'react-native';

export type DownloadTextFileOptions = {
  content: string;
  filename: string;
  mimeType?: string;
};

export type DownloadTextFileResult = {
  success: boolean;
  method?: 'download' | 'share';
};

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return 'download.txt';
  return trimmed.replace(/[/\\?%*:|"<>]/g, '_');
}

function normalizeShareMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim() || 'text/plain';
}

function iosUtiForFile(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json') || mimeType.includes('json')) return 'public.json';
  if (lower.endsWith('.csv') || mimeType.includes('csv')) return 'public.comma-separated-values-text';
  if (lower.endsWith('.md') || mimeType.includes('markdown')) return 'net.daringfireball.markdown';
  return 'public.plain-text';
}

/** UTF-8 BOM helps Excel open CSV correctly on Windows and some mobile viewers. */
function withCsvBomIfNeeded(content: string, filename: string): string {
  if (!filename.toLowerCase().endsWith('.csv')) return content;
  if (content.charCodeAt(0) === 0xfeff) return content;
  return `\uFEFF${content}`;
}

function waitForUiReady(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

async function downloadOnWeb(content: string, filename: string, mimeType: string): Promise<boolean> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return false;
  }

  try {
    const payload = withCsvBomIfNeeded(content, filename);
    const blob = new Blob([payload], { type: normalizeShareMimeType(mimeType) });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    return false;
  }
}

async function openNativeShareSheet(
  fileUri: string,
  safeName: string,
  shareMimeType: string,
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  let shareUri = fileUri;
  if (Platform.OS === 'android') {
    try {
      shareUri = await FileSystem.getContentUriAsync(fileUri);
    } catch {
      return false;
    }
  }

  const shareOptions: Sharing.SharingOptions = {};
  if (Platform.OS === 'android') {
    shareOptions.mimeType = shareMimeType;
    shareOptions.dialogTitle = `Save ${safeName}`;
  }
  if (Platform.OS === 'ios') {
    shareOptions.UTI = iosUtiForFile(safeName, shareMimeType);
  }

  try {
    await waitForUiReady();
    await Sharing.shareAsync(shareUri, shareOptions);
    return true;
  } catch {
    return false;
  }
}

async function downloadOnNative(content: string, filename: string, mimeType: string): Promise<boolean> {
  const baseDir =
    Platform.OS === 'ios'
      ? FileSystem.documentDirectory ?? FileSystem.cacheDirectory
      : FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) return false;

  const safeName = sanitizeFilename(filename);
  const fileUri = `${baseDir}${safeName}`;
  const payload = withCsvBomIfNeeded(content, safeName);
  const shareMimeType = normalizeShareMimeType(mimeType);

  try {
    const existing = await FileSystem.getInfoAsync(fileUri);
    if (existing.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
    await FileSystem.writeAsStringAsync(fileUri, payload, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    return false;
  }

  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || (typeof info.size === 'number' && info.size === 0)) {
    return false;
  }

  return openNativeShareSheet(fileUri, safeName, shareMimeType);
}

/**
 * Saves a text file cross-platform.
 * - Web: triggers a browser download
 * - iOS / Android: writes a local file and opens the native share / save sheet
 */
export async function downloadTextFile({
  content,
  filename,
  mimeType = 'text/plain;charset=utf-8',
}: DownloadTextFileOptions): Promise<DownloadTextFileResult> {
  if (!content.trim()) {
    return { success: false };
  }

  const safeName = sanitizeFilename(filename);

  try {
    if (Platform.OS === 'web') {
      const success = await downloadOnWeb(content, safeName, mimeType);
      return success ? { success: true, method: 'download' } : { success: false };
    }

    const success = await downloadOnNative(content, safeName, mimeType);
    return success ? { success: true, method: 'share' } : { success: false };
  } catch {
    return { success: false };
  }
}
