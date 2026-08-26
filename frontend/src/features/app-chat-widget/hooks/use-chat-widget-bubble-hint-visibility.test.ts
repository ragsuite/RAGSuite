import {
  resolveChatBubbleHintSchedule,
} from '@/features/app-chat-widget/hooks/use-chat-widget-bubble-hint-visibility';
import { motion } from '@/theme/motion';

describe('resolveChatBubbleHintSchedule', () => {
  it('hides when open', () => {
    expect(
      resolveChatBubbleHintSchedule({ bubbleMessage: 'Chat with us', isOpen: true }),
    ).toEqual({ kind: 'hidden' });
  });

  it('hides when message is empty', () => {
    expect(resolveChatBubbleHintSchedule({ bubbleMessage: '  ', isOpen: false })).toEqual({
      kind: 'hidden',
    });
    expect(resolveChatBubbleHintSchedule({ bubbleMessage: null, isOpen: false })).toEqual({
      kind: 'hidden',
    });
  });

  it('schedules appear + visible window when closed with copy', () => {
    expect(
      resolveChatBubbleHintSchedule({ bubbleMessage: 'Chat with us', isOpen: false }),
    ).toEqual({
      kind: 'show-after',
      delayMs: motion.chatBubbleAppearDelay,
      visibleMs: motion.chatBubbleVisibleMs,
    });
  });

  it('accepts override timings', () => {
    expect(
      resolveChatBubbleHintSchedule({
        bubbleMessage: 'Hi',
        isOpen: false,
        appearDelayMs: 100,
        visibleMs: 200,
      }),
    ).toEqual({ kind: 'show-after', delayMs: 100, visibleMs: 200 });
  });
});
