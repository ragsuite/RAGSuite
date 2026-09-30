export type VoiceInputTooltipPlacement = 'above' | 'beside';

/**
 * Chat panel has room above the mic. Search embeds sit in a tight iframe, so
 * the hover label must stay inside the field (left of the icon).
 */
export function voiceInputTooltipPlacement(
  surface: 'chat' | 'search' | undefined,
): VoiceInputTooltipPlacement {
  return surface === 'search' ? 'beside' : 'above';
}
