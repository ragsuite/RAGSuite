import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { renderPptxPreview } from '@/features/crawl/utils/document-pptx-utils';

type Props = {
  arrayBuffer: ArrayBuffer;
  onError?: () => void;
};

/**
 * Web-only PPTX slide preview host. Keeps pptx-preview out of native bundles
 * via dynamic import inside renderPptxPreview.
 */
export function PptxPreviewPanel({ arrayBuffer, onError }: Props) {
  const hostRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      onError?.();
      return;
    }
    let disposed = false;
    let disposePreview: (() => void) | undefined;

    const run = async () => {
      const node = hostRef.current as unknown as HTMLElement | null;
      if (!node || typeof document === 'undefined') {
        onError?.();
        return;
      }
      try {
        disposePreview = await renderPptxPreview(node, arrayBuffer);
        if (disposed) {
          disposePreview();
        }
      } catch {
        if (!disposed) onError?.();
      }
    };
    void run();

    return () => {
      disposed = true;
      try {
        disposePreview?.();
      } catch {
        // ignore
      }
    };
  }, [arrayBuffer, onError]);

  if (Platform.OS !== 'web') {
    return null;
  }

  return <View ref={hostRef} collapsable={false} style={styles.host} />;
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
    minHeight: 400,
    maxHeight: 480,
    overflow: 'scroll' as unknown as 'hidden',
  },
});
