import { useEffect, useState } from 'react';

import { handleGetDocumentOcrOptions, type DocumentOcrOption } from '@/network/actions/document.actions';

type Params = {
  visible: boolean;
};

export function useOcrModelOptions({ visible }: Params): {
  options: DocumentOcrOption[];
  loading: boolean;
} {
  const [options, setOptions] = useState<DocumentOcrOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    void handleGetDocumentOcrOptions()
      .then((next) => {
        if (!cancelled) setOptions(next);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  return { options, loading };
}
