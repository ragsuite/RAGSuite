import { useCallback, useRef, useState } from 'react';

import type { SourceAnswersLockReason } from '@/features/crawl/utils/crawl.utils';
import { commitSourceAnswersToggle } from '@/features/crawl/utils/source-answers-toggle';

export type SourceAnswersChange = (sourceId: string, enabled: boolean) => Promise<boolean>;

export type SourceAnswersState = {
  sourceId: string;
  /** Saved value from the bundle. */
  usedInAnswers: boolean;
  lockReason: SourceAnswersLockReason | null;
};

/** Optimistic on/off state for any source's "Use in answers" switch (crawl, Document, Text, Q&A). */
export function useSourceAnswersToggle(
  { sourceId, usedInAnswers, lockReason }: SourceAnswersState,
  onChange: SourceAnswersChange,
) {
  const [override, setOverride] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const toggle = useCallback(
    async (next: boolean) => {
      if (pendingRef.current || lockReason) return;
      pendingRef.current = true;
      setPending(true);
      await commitSourceAnswersToggle(next, (enabled) => onChange(sourceId, enabled), setOverride);
      pendingRef.current = false;
      setPending(false);
    },
    [lockReason, onChange, sourceId],
  );

  return {
    value: override ?? usedInAnswers,
    pending,
    lockReason,
    disabled: pending || lockReason !== null,
    toggle,
  };
}
