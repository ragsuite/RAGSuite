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
import {
  watchProviderAsrSilence,
  type ProviderAsrSilenceHandle,
} from '../provider-asr-silence';
import {
  fetchWidgetSpeechConfig,
  isMediaRecorderSupported,
  subscribeWidgetSpeechConfigReset,
  transcribeWidgetAudio,
  type WidgetSpeechSurface,
} from '../widget-speech-client';

type Options = {
  /** Widget answer language — kept for call-site compat; not used for STT. */
  language?: string | null;
  enabled: boolean;
  surface?: WidgetSpeechSurface;
  onTranscript: (text: string) => void;
  /** Fired once when recognition ends after non-empty speech (browser silence / utterance end). */
  onUtteranceEnd?: (text: string) => void;
};

export function useSpeechToText({
  language: _language,
  enabled,
  surface = 'chat',
  onTranscript,
  onUtteranceEnd,
}: Options) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proxyAsr, setProxyAsr] = useState(false);
  const browserSupported = isSpeechRecognitionSupported();
  const supported = browserSupported || (proxyAsr && isMediaRecorderSupported());
  const prefixRef = useRef('');
  const heardSpeechRef = useRef(false);
  const lastTranscriptRef = useRef('');
  const skipCommitRef = useRef(false);
  const usingProviderRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceWatchRef = useRef<ProviderAsrSilenceHandle | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onUtteranceEndRef = useRef(onUtteranceEnd);
  onTranscriptRef.current = onTranscript;
  onUtteranceEndRef.current = onUtteranceEnd;

  const stopProviderRecorder = useCallback((commit: boolean) => {
    skipCommitRef.current = !commit;
    silenceWatchRef.current?.stop();
    silenceWatchRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    setListening(false);
  }, []);

  const stop = useCallback(() => {
    skipCommitRef.current = true;
    if (usingProviderRef.current) {
      stopProviderRecorder(false);
      setActiveVoiceInput(null);
      return;
    }
    cancelVoiceInput();
    setListening(false);
  }, [stopProviderRecorder]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      void fetchWidgetSpeechConfig(surface, { fresh: true }).then((config) => {
        if (!cancelled) setProxyAsr(config.asr);
      });
    };
    load();
    const unsubscribe = subscribeWidgetSpeechConfigReset(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, surface]);

  useEffect(
    () => () => {
      cancelAllVoice();
      stopProviderRecorder(false);
    },
    [stopProviderRecorder],
  );

  useEffect(() => {
    if (!enabled && listening) {
      stop();
    }
  }, [enabled, listening, stop]);

  const startProvider = useCallback(
    async (currentValue: string) => {
      if (!isMediaRecorderSupported()) {
        setError('unsupported');
        return;
      }
      setError(null);
      prefixRef.current = currentValue.trim();
      heardSpeechRef.current = false;
      lastTranscriptRef.current = '';
      skipCommitRef.current = false;
      usingProviderRef.current = true;
      chunksRef.current = [];
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError('denied');
        usingProviderRef.current = false;
        return;
      }
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        silenceWatchRef.current?.stop();
        silenceWatchRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        setActiveVoiceInput(null);
        const commit = !skipCommitRef.current;
        usingProviderRef.current = false;
        recorderRef.current = null;
        if (!commit) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        void transcribeWidgetAudio(blob, surface).then((spoken) => {
          if (!spoken) return;
          const next = [prefixRef.current, spoken].filter(Boolean).join(' ');
          heardSpeechRef.current = true;
          lastTranscriptRef.current = next;
          onTranscriptRef.current(next);
          onUtteranceEndRef.current?.(next);
        });
      };
      const halt = () => stopProviderRecorder(true);
      setActiveVoiceInput(halt);
      setListening(true);
      try {
        recorder.start();
        silenceWatchRef.current = watchProviderAsrSilence(stream, () => {
          stopProviderRecorder(true);
        });
      } catch {
        setError('unsupported');
        stream.getTracks().forEach((track) => track.stop());
        usingProviderRef.current = false;
        setListening(false);
        setActiveVoiceInput(null);
      }
    },
    [stopProviderRecorder, surface],
  );

  const start = useCallback(
    (currentValue: string) => {
      if (!enabled) return;
      void (async () => {
        const config = await fetchWidgetSpeechConfig(surface, { fresh: true });
        if (config.asr) {
          await startProvider(currentValue);
          return;
        }
        if (!browserSupported) return;
        setError(null);
        const recognizer = createRecognizer();
        if (!recognizer) {
          setError('unsupported');
          return;
        }
        usingProviderRef.current = false;
        prefixRef.current = currentValue.trim();
        heardSpeechRef.current = false;
        lastTranscriptRef.current = '';
        skipCommitRef.current = false;
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
      })();
    },
    [enabled, browserSupported, startProvider, surface],
  );

  const toggle = useCallback(
    (currentValue: string) => {
      if (listening) {
        if (usingProviderRef.current) {
          stopProviderRecorder(true);
          return;
        }
        stop();
        return;
      }
      start(currentValue);
    },
    [listening, start, stop, stopProviderRecorder],
  );

  return { supported, listening, error, toggle, stop };
}
