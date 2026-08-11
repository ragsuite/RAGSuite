import { brandTokens } from '@/theme/brand-tokens';

/** Motion tokens aligned with reference web (Framer page transitions + sidebar). */
export const motion = {
  hover: brandTokens.motion.hover,
  reveal: brandTokens.motion.reveal,
  verify: brandTokens.motion.verify,
  pageEnter: 200,
  sidebar: 300,
  /** Center dialog zoom enter/exit */
  modalEnter: 200,
  /** Side sheet slide — reference web Sheet: 500ms open, 300ms close */
  sideSheetEnter: 500,
  sideSheetExit: 300,
  /** Compact bottom sheet — ease timing (no spring jump). */
  bottomSheetEnter: 320,
  bottomSheetExit: 240,
  pressScale: 0.95,
  /** Legacy aliases */
  quick: brandTokens.motion.hover,
  normal: brandTokens.motion.reveal,
} as const;
