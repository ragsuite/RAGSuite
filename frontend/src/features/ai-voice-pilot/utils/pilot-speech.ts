type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function webWindow(): (Window & typeof globalThis) | null {
  if (typeof window === 'undefined') return null;
  return window;
}

export function isSpeechRecognitionSupported(): boolean {
  const w = webWindow();
  if (!w) return false;
  return Boolean(
    (w as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
      (w as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition,
  );
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = webWindow();
  if (!w) return null;
  return (
    (w as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
    (w as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ||
    null
  );
}

export function createPilotRecognizer(locale: string): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const recognizer = new Ctor();
  recognizer.lang = locale || 'en-US';
  recognizer.continuous = false;
  recognizer.interimResults = true;
  return recognizer;
}
