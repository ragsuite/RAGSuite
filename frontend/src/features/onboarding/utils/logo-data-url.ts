import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

function guessMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export async function uriToDataUrl(uri: string | undefined | null): Promise<string | null> {
  if (!uri?.trim()) return null;
  const trimmed = uri.trim();
  if (trimmed.startsWith('data:')) return trimmed;

  if (Platform.OS === 'web') {
    const response = await fetch(trimmed);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  const base64 = await FileSystem.readAsStringAsync(trimmed, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:${guessMimeType(trimmed)};base64,${base64}`;
}
