/** Named UI contribution points. CE hosts render these; EE modules fill them. */
export type ExtensionSlotId =
  | 'chat.composer.trailing'
  | 'chat.message.actions'
  | 'chat.widget.voicePilotPanel'
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

export type ChatbotVoicePilotPanelApi = {
  submitText: (text: string) => void;
};

export type ChatWidgetVoicePilotPanelProps = {
  previewMode?: boolean;
  /** Host project id — prefer over ActiveProject in embed/widget. */
  projectId?: string | null;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  backgroundColor: string;
  language?: string | null;
  contentHeight?: number;
  /** Chatbot-only display name under the orb (not Pilot catalog voice name). */
  orbName?: string | null;
  /** Host registers composer → voice agent bridge. */
  onReady?: (api: ChatbotVoicePilotPanelApi) => void;
};

export type ExtensionSlotPropsMap = {
  'chat.composer.trailing': VoiceInputSlotProps;
  'search.composer.trailing': VoiceInputSlotProps;
  'chat.message.actions': VoiceOutputSlotProps;
  'search.result.actions': VoiceOutputSlotProps;
  'chat.widget.voicePilotPanel': ChatWidgetVoicePilotPanelProps;
};
