/** Hint bubble maxWidth (AppChatWidgetBubbleHint) + horizontal padding/border. */
export const CHAT_EMBED_HINT_MAX_WIDTH = 300;
const HINT_CHROME = 16;
const FRAME_PAD = 16;
/** Vertical space for hint shell + margin below hint above launcher. */
const HINT_VERTICAL_RESERVE = 72;

export type ClosedChatEmbedFrameSize = {
  width: number;
  height: number;
};

export type OpenChatEmbedFrameSize = {
  width: number;
  height: number;
};

/**
 * Prefer DOM content box metrics for the closed launcher+hint anchor.
 */
export function measureClosedChatEmbedFrame(
  node: HTMLElement | null | undefined,
): ClosedChatEmbedFrameSize | null {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  const width = Math.max(rect.width, node.scrollWidth, node.offsetWidth);
  const height = Math.max(rect.height, node.scrollHeight, node.offsetHeight);
  if (!(width > 0 && height > 0)) return null;
  return { width, height };
}

/**
 * Resolve closed-state iframe size so the launcher hint is not clipped.
 */
export function resolveClosedChatEmbedFrameSize(args: {
  measured: ClosedChatEmbedFrameSize | null | undefined;
  launcherSize: number;
  showBubble: boolean;
}): ClosedChatEmbedFrameSize {
  const pad = FRAME_PAD;
  const launcherFloor = Math.max(64, Math.ceil(args.launcherSize + pad));
  let width = Math.max(launcherFloor, Math.ceil(args.measured?.width ?? launcherFloor));
  let height = Math.max(launcherFloor, Math.ceil(args.measured?.height ?? launcherFloor));

  if (args.showBubble) {
    const hintFloorWidth = CHAT_EMBED_HINT_MAX_WIDTH + HINT_CHROME + pad;
    const hintFloorHeight = launcherFloor + HINT_VERTICAL_RESERVE;
    width = Math.max(width, hintFloorWidth);
    height = Math.max(height, hintFloorHeight);
  }

  return { width, height };
}

/** Keep open panel iframe tight when backdrop is disabled. */
export function resolveOpenChatEmbedFrameSize(args: {
  panelWidth: number;
  panelHeight: number;
  launcherSize: number;
  launcherGap: number;
  pad?: number;
}): OpenChatEmbedFrameSize {
  const pad = args.pad ?? FRAME_PAD;
  const width = Math.max(320, Math.ceil(args.panelWidth + pad * 2));
  const height = Math.max(
    360,
    Math.ceil(args.panelHeight + args.launcherSize + args.launcherGap + pad * 2),
  );
  return { width, height };
}
