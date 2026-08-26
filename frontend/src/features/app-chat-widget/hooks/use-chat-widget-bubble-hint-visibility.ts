import { useEffect, useState } from 'react';

import { motion } from '@/theme/motion';

export type ChatBubbleHintSchedule =
  | { kind: 'hidden' }
  | { kind: 'show-after'; delayMs: number; visibleMs: number };

/**
 * Pure schedule for the closed-state launcher teaser bubble.
 * Shown briefly after load/close; never while the panel is open.
 */
export function resolveChatBubbleHintSchedule(args: {
  bubbleMessage: string | null | undefined;
  isOpen: boolean;
  appearDelayMs?: number;
  visibleMs?: number;
}): ChatBubbleHintSchedule {
  if (args.isOpen || !args.bubbleMessage?.trim()) {
    return { kind: 'hidden' };
  }
  return {
    kind: 'show-after',
    delayMs: args.appearDelayMs ?? motion.chatBubbleAppearDelay,
    visibleMs: args.visibleMs ?? motion.chatBubbleVisibleMs,
  };
}

/**
 * Temporary bubble visibility for Host, Embed, and Live Preview.
 * Appears after a short delay when closed, then auto-hides.
 */
export function useChatWidgetBubbleHintVisibility(
  bubbleMessage: string | null | undefined,
  isOpen: boolean,
): boolean {
  const [showBubble, setShowBubble] = useState(false);

  useEffect(() => {
    const schedule = resolveChatBubbleHintSchedule({ bubbleMessage, isOpen });
    if (schedule.kind === 'hidden') {
      setShowBubble(false);
      return;
    }

    setShowBubble(false);
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const showTimer = setTimeout(() => {
      setShowBubble(true);
      hideTimer = setTimeout(() => {
        setShowBubble(false);
      }, schedule.visibleMs);
    }, schedule.delayMs);

    return () => {
      clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [bubbleMessage, isOpen]);

  return showBubble;
}
