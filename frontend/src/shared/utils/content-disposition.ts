/** Extracts the suggested download filename from a `Content-Disposition` header. */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header?.trim()) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(header);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  const plainMatch = /filename=([^;]+)/i.exec(header);
  return plainMatch?.[1]?.trim().replace(/"/g, '') ?? null;
}

/** Replaces characters that are unsafe in filenames across platforms. */
export function sanitizeSuggestedFilename(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, '_');
}
