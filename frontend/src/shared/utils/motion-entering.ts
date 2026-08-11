import { FadeIn, FadeInDown, FadeInUp, FadeOut, type BaseAnimationBuilder } from 'react-native-reanimated';

import { motion } from '@/theme/motion';

type EnteringAnimation = BaseAnimationBuilder | typeof BaseAnimationBuilder;

/** Skip entrance motion when the user prefers reduced motion. */
export function fadeInDownEntering(reducedMotion: boolean, durationMs = motion.reveal): EnteringAnimation | undefined {
  return reducedMotion ? undefined : FadeInDown.duration(durationMs);
}

export function fadeInEntering(reducedMotion: boolean, durationMs = motion.verify): EnteringAnimation | undefined {
  return reducedMotion ? undefined : FadeIn.duration(durationMs);
}

/** Page transition — bottom-to-top reveal (Analytics / module open parity). */
export function pageEntering(reducedMotion: boolean): EnteringAnimation | undefined {
  return reducedMotion ? undefined : FadeInUp.duration(motion.pageEnter);
}

export function pageExiting(reducedMotion: boolean): EnteringAnimation | undefined {
  return reducedMotion ? undefined : FadeOut.duration(motion.pageEnter);
}
