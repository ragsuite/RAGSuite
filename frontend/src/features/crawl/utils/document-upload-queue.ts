import { Platform } from 'react-native';

import { inferMimeType } from '@/features/crawl/utils/document-form';

export type DocumentUploadFile =
  | File
  | { uri: string; name: string; mimeType?: string };

export type DocumentUploadQueueItem = {
  file: DocumentUploadFile;
  relPath: string;
};

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.html', '.htm']);

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function isAllowed(name: string): boolean {
  return ALLOWED_EXTENSIONS.has(extOf(name));
}

function isZipFile(file: File): boolean {
  return (
    extOf(file.name) === '.zip' ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}

async function expandZipFile(file: File): Promise<{ items: DocumentUploadQueueItem[]; skipped: number }> {
  if (Platform.OS !== 'web') {
    return { items: [], skipped: 1 };
  }
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);
    const items: DocumentUploadQueueItem[] = [];
    let skipped = 0;
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const entryName = entry.name.replace(/\\/g, '/');
      const baseName = entryName.split('/').pop() ?? entryName;
      if (baseName.startsWith('._') || !isAllowed(baseName)) {
        skipped += 1;
        continue;
      }
      const blob = await entry.async('blob');
      const extracted = new File([blob], baseName, { type: inferMimeType(baseName) });
      items.push({ file: extracted, relPath: entryName });
    }
    return { items, skipped };
  } catch {
    return { items: [], skipped: 1 };
  }
}

export async function expandDocumentUploadFiles(
  files: DocumentUploadFile[],
): Promise<{ queue: DocumentUploadQueueItem[]; skipped: number }> {
  const queue: DocumentUploadQueueItem[] = [];
  let skipped = 0;

  for (const file of files) {
    if (typeof File !== 'undefined' && file instanceof File) {
      if (isZipFile(file)) {
        const expanded = await expandZipFile(file);
        queue.push(...expanded.items);
        skipped += expanded.skipped;
        continue;
      }
      const relPath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (file.name.startsWith('._') || !isAllowed(file.name)) {
        skipped += 1;
        continue;
      }
      queue.push({ file, relPath });
      continue;
    }

    const native = file as { uri: string; name: string; mimeType?: string };
    if (native.name.startsWith('._') || !isAllowed(native.name)) {
      skipped += 1;
      continue;
    }
    queue.push({ file: native, relPath: native.name });
  }

  return { queue, skipped };
}

export function buildUploadQueueFromPayload(
  files: DocumentUploadFile[] | undefined,
  fileNames: string[],
): DocumentUploadQueueItem[] {
  if (files?.length) {
    return files.map((file, index) => ({
      file,
      relPath: ('name' in file ? file.name : (file as File).name) || fileNames[index] || `file-${index}`,
    }));
  }
  return fileNames.map((name) => ({
    file: { uri: name, name, mimeType: inferMimeType(name) },
    relPath: name,
  }));
}
