import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cancelAllVoice,
  cancelVoiceInput,
  setActiveVoiceInput,
} from '../speech-session';
import { shouldCommitVoiceUtterance } from '../voice-utterance';
import {
  createRecognizer,
  isSpeechRecognitionSupported,
  resolveSttLocale,
} from '../web-speech';

type Options = {
  /** Widget answer language — kept for call-site compat; not used for STT. */
  language?: string | null;
  enabled: boolean;
  onTranscript: (text: string) => void;
  /** Fired once when recognition ends after non-empty speech (browser silence / utterance end). */
  onUtteranceEnd?: (text: string) => void;
};

export function useSpeechToText({ language: _language, enabled, onTranscript, onUtteranceEnd }: Options) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const browserSupported = isSpeechRecognitionSupported();
  const prefixRef = useRef('');
  const heardSpeechRef = useRef(false);
  const lastTranscriptRef = useRef('');
  const skipCommitRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onUtteranceEndRef = useRef(onUtteranceEnd);
  onTranscriptRef.current = onTranscript;
  onUtteranceEndRef.current = onUtteranceEnd;

  const stop = useCallback(() => {
    // Manual cancel / disable — do not auto-submit.
    skipCommitRef.current = true;
    cancelVoiceInput();
    setListening(false);
  }, []);

  useEffect(() => () => {
    cancelAllVoice();
  }, []);

  useEffect(() => {
    if (!enabled && listening) {
      stop();
    }
  }, [enabled, listening, stop]);

  const start = useCallback(
    (currentValue: string) => {
      if (!enabled || !browserSupported) return;
      setError(null);
      const recognizer = createRecognizer();
      if (!recognizer) {
        setError('unsupported');
        return;
      }
      prefixRef.current = currentValue.trim();
      heardSpeechRef.current = false;
      lastTranscriptRef.current = '';
      skipCommitRef.current = false;
      // Browser/OS locale — never widget answer language (avoids mishearing EN as DE, etc.).
      recognizer.lang = resolveSttLocale();
      recognizer.continuous = false;
      recognizer.interimResults = true;

      const halt = () => {
        try {
          recognizer.stop();
        } catch {
          try {
            recognizer.abort();
          } catch {
            /* ignore */
          }
        }
        setListening(false);
      };

      setActiveVoiceInput(halt);
      setListening(true);

      recognizer.onresult = (event) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript ?? '';
          if (event.results[i].isFinal) finalText += piece;
          else interim += piece;
        }
        const spoken = (finalText || interim).trim();
        const prefix = prefixRef.current;
        const next = [prefix, spoken].filter(Boolean).join(' ');
        if (spoken) {
          heardSpeechRef.current = true;
          lastTranscriptRef.current = next;
        }
        onTranscriptRef.current(next);
      };

      recognizer.onerror = (event) => {
        const code = event.error || 'error';
        // "no-speech" / aborts should not submit; other errors also skip commit.
        skipCommitRef.current = true;
        setError(code === 'not-allowed' || code === 'service-not-allowed' ? 'denied' : code);
        halt();
      };

      recognizer.onend = () => {
        setListening(false);
        setActiveVoiceInput(null);
        if (
          !shouldCommitVoiceUtterance({
            skipCommit: skipCommitRef.current,
            heardSpeech: heardSpeechRef.current,
            transcript: lastTranscriptRef.current,
          })
        ) {
          return;
        }
        onUtteranceEndRef.current?.(lastTranscriptRef.current.trim());
      };

      try {
        recognizer.start();
      } catch {
        setError('unsupported');
        skipCommitRef.current = true;
        halt();
      }
    },
    [enabled, browserSupported],
  );

  const toggle = useCallback(
    (currentValue: string) => {
      if (listening) {
        stop();
        return;
      }
      start(currentValue);
    },
    [listening, start, stop],
  );

  return { supported: browserSupported, listening, error, toggle, stop };
}
