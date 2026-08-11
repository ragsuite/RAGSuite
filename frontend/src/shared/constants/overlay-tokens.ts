import { motion } from '@/theme/motion';

/**
 * Overlay / sheet widths aligned to reference web Tailwind Sheet overrides.
 * @see frontend client/src/components/ui/sheet.tsx (+ page SheetContent classNames)
 */
export const overlayTokens = {
  /** Reference web Sheet overlay: bg-black/80 */
  backdrop: 'rgba(0, 0, 0, 0.8)',
  /**
   * Top-left / top-right radius for compact bottom sheets (native + narrow web).
   * Bottom sheets are full-bleed; only the top corners are rounded.
   */
  bottomSheetTopRadius: 16,
  zIndex: {
    overlay: 100_000,
    content: 100_001,
  },
  width: {
    /** Dialog: Profile / ApiKeys `sm:max-w-md` */
    confirm: 448,
    /** Dialog: form dialogs ~`max-w-md` / `max-w-lg` */
    form: 480,
    default: 560,
    wide: 640,
    /** Sheet default / Crawl document detail: `w-96` / `sm:max-w-sm` */
    sideSheetSm: 384,
    /** Notifications inbox: `sm:!w-[500px]` */
    sideSheetNotify: 500,
    /** AuditLogs detail: `sm:max-w-lg` */
    sideSheetForm: 512,
    /** CrawlJobs detail: `sm:max-w-xl` */
    sideSheetMd: 576,
    /** Feedback + History detail: `sm:max-w-2xl` */
    sideSheetLg: 672,
    /** Crawl add/edit source form (content-heavy) */
    sideSheetSource: 700,
    /** Document inspector / session management */
    sideSheetXl: 896,
    popover: 224,
  },
  motion: {
    enter: motion.modalEnter,
    sideSheetEnter: motion.sideSheetEnter,
    sideSheetExit: motion.sideSheetExit,
    bottomSheetEnter: motion.bottomSheetEnter,
    bottomSheetExit: motion.bottomSheetExit,
  },
} as const;

export type OverlaySize =
  | 'confirm'
  | 'form'
  | 'default'
  | 'wide'
  | 'sideSheetSm'
  | 'sideSheetNotify'
  | 'sideSheetForm'
  | 'sideSheetMd'
  | 'sideSheetLg'
  | 'sideSheetSource'
  | 'sideSheetXl'
  | 'popover';

export function resolveOverlayWidth(size?: OverlaySize | number, maxWidth?: number): number {
  if (typeof maxWidth === 'number') return maxWidth;
  if (typeof size === 'number') return size;
  if (size) return overlayTokens.width[size];
  return overlayTokens.width.default;
}

/** True when size token should render as a right side sheet on wide web. */
export function isSideSheetSize(size?: OverlaySize | number): boolean {
  return (
    typeof size === 'string' &&
    (size === 'sideSheetSm' ||
      size === 'sideSheetNotify' ||
      size === 'sideSheetForm' ||
      size === 'sideSheetMd' ||
      size === 'sideSheetLg' ||
      size === 'sideSheetSource' ||
      size === 'sideSheetXl')
  );
}
