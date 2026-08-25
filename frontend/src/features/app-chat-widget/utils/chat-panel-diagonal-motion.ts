export type ChatPanelPosition = 'bottom-right' | 'bottom-left';

export type ChatPanelDiagonalOffset = {
  transformOrigin: 'bottom right' | 'bottom left';
  startScale: number;
  startX: number;
  startY: number;
};

export const CHAT_PANEL_DEFAULT_START_SCALE = 0.16;
const DEFAULT_START_SCALE = CHAT_PANEL_DEFAULT_START_SCALE;
const DEFAULT_NUDGE_RATIO = 0.25;

function clampStartScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_START_SCALE;
  const next = value as number;
  if (next <= 0 || next >= 1) return DEFAULT_START_SCALE;
  return next;
}

/** Map openProgress 0→1 to host shell scale (SalesIQ-style grow from launcher). */
export function resolveChatPanelShellScale(progress: number, startScale = DEFAULT_START_SCALE): number {
  const p = Math.max(0, Math.min(1, progress));
  const start = clampStartScale(startScale);
  return start + (1 - start) * p;
}

/**
 * Grows the panel from the launcher icon (t3planet-style).
 * Transform origin sits on the launcher corner; scale + a small nudge
 * toward that icon reverse on close via openProgress.
 */
export function resolveChatPanelDiagonalOffset(args: {
  position: string;
  launcherSize: number;
  startScale?: number;
  nudgeRatio?: number;
}): ChatPanelDiagonalOffset {
  const isLeft = args.position === 'bottom-left';
  const startScale = clampStartScale(args.startScale);
  const launcherSize = Math.max(0, Math.round(args.launcherSize || 0));
  const nudgeRatio = Number.isFinite(args.nudgeRatio)
    ? Math.max(0, args.nudgeRatio ?? 0)
    : DEFAULT_NUDGE_RATIO;
  const nudge = Math.round(launcherSize * nudgeRatio);

  return {
    transformOrigin: isLeft ? 'bottom left' : 'bottom right',
    startScale,
    startX: nudge === 0 ? 0 : isLeft ? -nudge : nudge,
    startY: nudge,
  };
}
