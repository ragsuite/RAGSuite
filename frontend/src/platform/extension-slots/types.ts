/** Named UI contribution points. CE hosts render these; EE modules fill them. */
export type ExtensionSlotId =
  | 'chat.composer.trailing'
  | 'chat.message.actions'
  | 'search.composer.trailing'
  | 'search.result.actions';

export type VoiceInputSlotProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Called after mic utterance ends with non-empty transcript (auto-submit hosts). */
  onVoiceCommitted?: (text: string) => void;
  disabled?: boolean;
  previewMode?: boolean;
  language?: string | null;
  iconColor: string;
  activeColor: string;
  surface: 'chat' | 'search';
};

export type VoiceOutputSlotProps = {
  /** Stable id for the answer being spoken (message id / search result id). */
  contentKey: string;
  text: string;
  disabled?: boolean;
  language?: string | null;
  iconColor: string;
  activeColor: string;
  selectedIconColor: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipColor: string;
  surface: 'chat' | 'search';
};

export type ExtensionSlotPropsMap = {
  'chat.composer.trailing': VoiceInputSlotProps;
  'search.composer.trailing': VoiceInputSlotProps;
  'chat.message.actions': VoiceOutputSlotProps;
  'search.result.actions': VoiceOutputSlotProps;
};
