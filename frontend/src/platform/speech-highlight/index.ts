export {
  clearSpeechHighlight,
  getSpeechHighlightState,
  setSpeechHighlightWord,
  startSpeechHighlightSession,
  subscribeSpeechHighlight,
  updateSpeechHighlightWordCount,
  type SpeechHighlightState,
} from '@/platform/speech-highlight/store';
export { renderSpeechWords, type SpeechWordRenderCursor } from '@/platform/speech-highlight/render-speech-words';
export {
  applySpeechWordHighlight,
  clearSpeechWordSpans,
  prepareSpeechWordSpans,
  ACTIVE_CLASS,
} from '@/platform/speech-highlight/dom-highlight';
export { countSpeechWords, tokenizeSpeechWords, type SpeechWordToken } from '@/platform/speech-highlight/tokenize';
export { useSpeechHighlight } from '@/platform/speech-highlight/use-speech-highlight';
