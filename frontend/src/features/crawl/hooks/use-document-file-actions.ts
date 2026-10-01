import { useCallback, useState } from 'react';

import { downloadDocumentFile } from '@/features/crawl/services/crawl.service';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { openDocumentPreview } from '@/features/crawl/utils/document-preview';
import {
  canOpenDocumentInBrowser,
  resolveDocumentPreviewKind,
} from '@/features/crawl/utils/document-preview-kind';
import { useTranslation } from '@/i18n';
import { useToast } from '@/shared/toast/use-toast';

/** "Open in new tab" (only when a browser can show the file) and an explicit "Download". */
export function useDocumentFileActions(document: CrawlDocument | null) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const canOpen = document != null && canOpenDocumentInBrowser(resolveDocumentPreviewKind(document));

  const open = useCallback(async () => {
    if (!document || !canOpen) return;
    setOpening(true);
    try {
      const opened = await openDocumentPreview(document, t);
      if (!opened) toast({ description: t('documents.previewUnavailable'), variant: 'error' });
    } finally {
      setOpening(false);
    }
  }, [canOpen, document, t, toast]);

  const download = useCallback(async () => {
    if (!document) return;
    setDownloading(true);
    try {
      const started = await downloadDocumentFile(document.id);
      if (!started) toast({ description: t('documents.inspector.downloadFailed'), variant: 'error' });
    } finally {
      setDownloading(false);
    }
  }, [document, t, toast]);

  return { canOpen, opening, downloading, open, download };
}
