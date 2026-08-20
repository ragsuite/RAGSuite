import { useSyncExternalStore } from 'react';

import {
  getSpeechHighlightState,
  subscribeSpeechHighlight,
  type SpeechHighlightState,
} from '@/platform/speech-highlight/store';

export function useSpeechHighlight(contentKey: string | null | undefined): {
  isActive: boolean;
  activeWordIndex: number | null;
} {
  const snapshot = useSyncExternalStore(
    subscribeSpeechHighlight,
    getSpeechHighlightState,
    () => null as SpeechHighlightState,
  );

  if (!contentKey || !snapshot || snapshot.contentKey !== contentKey) {
    return { isActive: false, activeWordIndex: null };
  }

  return {
    isActive: true,
    activeWordIndex: snapshot.wordIndex >= 0 ? snapshot.wordIndex : null,
  };
}
