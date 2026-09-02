import { Platform } from 'react-native';

import type { PageSizeOption } from '@/shared/constants/pagination';
import { PAGE_SIZE_OPTIONS } from '@/shared/constants/pagination';

const STORAGE_PREFIX = 'ragsuite.pagination.pageSize.';

function isValidPageSize(value: number): value is PageSizeOption {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value);
}

export function readStoredPageSize(listKey: string, fallback: PageSizeOption): PageSizeOption {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
    return fallback;
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${listKey}`);
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return isValidPageSize(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredPageSize(listKey: string, pageSize: PageSizeOption): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(`${STORAGE_PREFIX}${listKey}`, String(pageSize));
  } catch {
    // Ignore quota / privacy mode errors.
  }
}
