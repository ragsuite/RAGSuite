type VoiceCopy = {
  startInput: string;
  voiceInput: string;
  listening: string;
  speak: string;
  stopSpeak: string;
  pauseSpeak: string;
  resumeSpeak: string;
  micDenied: string;
  unsupported: string;
};

const EN: VoiceCopy = {
  startInput: 'Start voice input',
  voiceInput: 'Voice Input',
  listening: 'Listening\u2026',
  speak: 'Read answer aloud',
  stopSpeak: 'Stop speaking',
  pauseSpeak: 'Pause',
  resumeSpeak: 'Resume',
  micDenied: 'Microphone permission denied',
  unsupported: 'Voice is not supported in this browser',
};

const STRINGS: Record<string, VoiceCopy> = {
  en: EN,
  de: {
    startInput: 'Spracheingabe starten',
    voiceInput: 'Spracheingabe',
    listening: 'H\u00f6rt zu\u2026',
    speak: 'Antwort vorlesen',
    stopSpeak: 'Vorlesen beenden',
    pauseSpeak: 'Pausieren',
    resumeSpeak: 'Fortsetzen',
    micDenied: 'Mikrofonzugriff verweigert',
    unsupported: 'Sprache wird in diesem Browser nicht unterst\u00fctzt',
  },
  fr: {
    startInput: 'Saisie vocale',
    voiceInput: 'Entr\u00e9e vocale',
    listening: '\u00c9coute\u2026',
    speak: 'Lire la r\u00e9ponse',
    stopSpeak: 'Arr\u00eater la lecture',
    pauseSpeak: 'Pause',
    resumeSpeak: 'Reprendre',
    micDenied: 'Autorisation microphone refus\u00e9e',
    unsupported: 'La saisie vocale n\u2019est pas prise en charge',
  },
  es: {
    startInput: 'Entrada de voz',
    voiceInput: 'Entrada de voz',
    listening: 'Escuchando\u2026',
    speak: 'Leer la respuesta',
    stopSpeak: 'Detener lectura',
    pauseSpeak: 'Pausar',
    resumeSpeak: 'Reanudar',
    micDenied: 'Permiso de micr\u00f3fono denegado',
    unsupported: 'La voz no es compatible en este navegador',
  },
};

export function voiceCopy(language?: string | null): VoiceCopy {
  const key = (language || 'en').trim().toLowerCase().split('-')[0] || 'en';
  return STRINGS[key] ?? EN;
}
