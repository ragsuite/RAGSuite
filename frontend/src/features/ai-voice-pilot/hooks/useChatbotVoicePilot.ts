import { useCallback, useEffect, useRef, useState } from 'react';

import type { VoicePilotSessionState } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import {
  chatbotVoicePilotTts,
  chatbotVoicePilotTurnStream,
  getChatbotVoicePilotBootstrap,
  type VoicePilotWidgetBootstrap,
} from '@/features/ai-voice-pilot/services/voice-pilot.service';
import {
  createPilotRecognizer,
  isSpeechRecognitionSupported,
} from '@/features/ai-voice-pilot/utils/pilot-speech';
import { probePilotMicrophone } from '@/features/ai-voice-pilot/utils/pilot-mic';
import {
  startPilotBargeInVad,
  type PilotVadHandle,
} from '@/features/ai-voice-pilot/utils/pilot-vad';
import {
  VOICE_AGENT_CONFIG,
  type VoiceAgentChatMessage,
} from '@/features/ai-voice-pilot/utils/voice-agent-config';
import {
  voiceAudioSession,
  type VoiceAudioBands,
} from '@/features/ai-voice-pilot/utils/voice-audio-session';
import {
  buildVoicePilotTurnHistory,
  resolveSpeechEndTranscript,
  shouldProcessRecognizerEnd,
  shouldRestartVoicePilotListen,
  VOICE_PILOT_POST_SPEECH_SETTLE_MS,
} from '@/features/app-chat-widget/utils/chatbot-voice-pilot-stt';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';

export type ChatbotVoicePilotMicError = 'none' | 'not_found' | 'denied' | 'unsupported';

function settleAfterSpeech(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, VOICE_PILOT_POST_SPEECH_SETTLE_MS);
  });
}

export function useChatbotVoicePilot(options?: {
  previewMode?: boolean;
  language?: string | null;
  /** Prefer host-provided project id (widget embed) over ActiveProject alone. */
  projectId?: string | null;
}) {
  const { t } = useTranslation();
  const { activeProjectId } = useActiveProject();
  const projectId = (options?.projectId || activeProjectId || '').trim();
  const previewMode = Boolean(options?.previewMode);

  const [bootstrap, setBootstrap] = useState<VoicePilotWidgetBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<ChatbotVoicePilotMicError>('none');
  const [sessionState, setSessionState] = useState<VoicePilotSessionState>('idle');
  const [agentActive, setAgentActive] = useState(false);
  const [orbBands, setOrbBands] = useState<VoiceAudioBands>(() => voiceAudioSession.getAudioBands());
  const [orbIntensity, setOrbIntensity] = useState(0);

  const bootstrapRef = useRef(bootstrap);
  const agentActiveRef = useRef(false);
  const sessionGenRef = useRef(0);
  const sessionStateRef = useRef<VoicePilotSessionState>('idle');
  const listenGenerationRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silencePhaseRef = useRef<'none' | 'first' | 'second'>('none');
  const followUpSpokenRef = useRef(false);
  /** When true, barge-in is suppressed (composer-originated turns). */
  const suppressBargeRef = useRef(false);
  const bargeVadRef = useRef<PilotVadHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognizerRef = useRef<ReturnType<typeof createPilotRecognizer> | null>(null);
  const turnHistoryRef = useRef<VoiceAgentChatMessage[]>([]);
  const enterListeningRef = useRef<() => void>(() => undefined);
  const endAgentSessionRef = useRef<() => void>(() => undefined);
  const scheduleSilenceTimerRef = useRef<
    (phase: 'first' | 'second', gen: number) => void
  >(() => undefined);
  const speakControlRef = useRef<
    (text: string, gen: number, opts?: { holdConnecting?: boolean }) => Promise<void>
  >(async () => undefined);

  bootstrapRef.current = bootstrap;
  agentActiveRef.current = agentActive;
  // Do NOT sync sessionStateRef from render state — that overwrites synchronous
  // setSessionStateSafe updates when orb/intensity re-renders before commit.

  const setSessionStateSafe = useCallback((next: VoicePilotSessionState) => {
    sessionStateRef.current = next;
    setSessionState(next);
  }, []);

  useEffect(
    () =>
      voiceAudioSession.subscribe(() => {
        setOrbBands(voiceAudioSession.getAudioBands());
      }),
    [],
  );

  useEffect(() => voiceAudioSession.subscribeIntensity(setOrbIntensity), []);

  useEffect(() => {
    if (!projectId || previewMode) {
      setLoading(false);
      setBootstrap(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getChatbotVoicePilotBootstrap(projectId)
      .then((data) => {
        if (!cancelled) {
          setBootstrap(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBootstrap(null);
          setError(err instanceof Error ? err.message : t('voicePilot.error.unavailable'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewMode, projectId]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopBargeVad = useCallback(() => {
    bargeVadRef.current?.stop();
    bargeVadRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    // Bump before abort so onend/onerror from this recognizer are ignored.
    listenGenerationRef.current += 1;
    try {
      recognizerRef.current?.abort();
    } catch {
      /* ignore */
    }
    recognizerRef.current = null;
  }, []);

  const stopAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    voiceAudioSession.stop();
  }, []);

  const endAgentSession = useCallback(() => {
    sessionGenRef.current += 1;
    agentActiveRef.current = false;
    setAgentActive(false);
    followUpSpokenRef.current = false;
    silencePhaseRef.current = 'none';
    suppressBargeRef.current = false;
    turnHistoryRef.current = [];
    clearSilenceTimer();
    stopBargeVad();
    stopListening();
    stopAudio();
    setSessionStateSafe('idle');
  }, [clearSilenceTimer, setSessionStateSafe, stopAudio, stopBargeVad, stopListening]);
  endAgentSessionRef.current = endAgentSession;

  const speakControl = useCallback(
    async (text: string, gen: number, opts?: { holdConnecting?: boolean }) => {
      if (!projectId || !text.trim()) return;
      const voiceId = bootstrapRef.current?.voice_id || 'pilot';
      const voiceName = bootstrapRef.current?.voice_name || 'Pilot';
      clearSilenceTimer();
      stopBargeVad();
      // Opening greeting: stay connecting until blob is ready.
      if (!opts?.holdConnecting) {
        setSessionStateSafe('speaking');
      }
      try {
        const blob = await chatbotVoicePilotTts(projectId, text.trim());
        if (gen !== sessionGenRef.current) return;
        setSessionStateSafe('speaking');
        await voiceAudioSession.playBlob(blob, { voice_id: voiceId, name: voiceName });
        await voiceAudioSession.waitUntilIdle();
        if (gen !== sessionGenRef.current) return;
        await settleAfterSpeech();
      } catch (err) {
        if (gen === sessionGenRef.current) {
          setError(err instanceof Error ? err.message : t('voicePilot.error.couldNotSpeak'));
        }
      }
    },
    [clearSilenceTimer, projectId, setSessionStateSafe, stopBargeVad],
  );
  speakControlRef.current = speakControl;

  const scheduleSilenceTimer = useCallback(
    (phase: 'first' | 'second', gen: number) => {
      clearSilenceTimer();
      silencePhaseRef.current = phase;
      const ms =
        phase === 'first'
          ? VOICE_AGENT_CONFIG.firstSilenceTimeoutMs
          : VOICE_AGENT_CONFIG.secondSilenceTimeoutMs;
      silenceTimerRef.current = setTimeout(() => {
        if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
        if (sessionStateRef.current !== 'listening') return;
        void (async () => {
          if (phase === 'first') {
            followUpSpokenRef.current = true;
            stopListening();
            await speakControlRef.current(VOICE_AGENT_CONFIG.followUpMessage, gen);
            if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
            enterListeningRef.current();
            scheduleSilenceTimerRef.current('second', gen);
          } else {
            stopListening();
            await speakControlRef.current(VOICE_AGENT_CONFIG.endMessage, gen);
            endAgentSessionRef.current();
          }
        })();
      }, ms);
    },
    [clearSilenceTimer, stopListening],
  );
  scheduleSilenceTimerRef.current = scheduleSilenceTimer;

  const startBargeInWatch = useCallback(
    async (gen: number) => {
      stopBargeVad();
      if (!agentActiveRef.current) return;
      if (suppressBargeRef.current) return;
      const handle = await startPilotBargeInVad({
        rmsThreshold: VOICE_AGENT_CONFIG.bargeInRmsThreshold,
        holdMs: VOICE_AGENT_CONFIG.bargeInHoldMs,
        onSpeech: () => {
          if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
          if (suppressBargeRef.current) return;
          if (sessionStateRef.current !== 'speaking') return;
          abortRef.current?.abort();
          abortRef.current = null;
          voiceAudioSession.stop();
          stopBargeVad();
          enterListeningRef.current();
        },
      });
      if (gen === sessionGenRef.current && !suppressBargeRef.current) {
        bargeVadRef.current = handle;
      } else {
        handle?.stop();
      }
    },
    [stopBargeVad],
  );

  // While agent is speaking, watch for barge-in (including opening greeting).
  // Skip while a composer-typed turn is playing so keyboard/mic noise cannot kill TTS.
  useEffect(() => {
    if (!agentActive || sessionState !== 'speaking' || suppressBargeRef.current) {
      stopBargeVad();
      return;
    }
    const gen = sessionGenRef.current;
    void startBargeInWatch(gen);
    return () => {
      stopBargeVad();
    };
  }, [agentActive, sessionState, startBargeInWatch, stopBargeVad]);

  const handleFinalTranscript = useCallback(
    async (transcript: string) => {
      const text = transcript.trim();
      const gen = sessionGenRef.current;
      if (!text || !projectId) {
        if (agentActiveRef.current) enterListeningRef.current();
        else setSessionStateSafe('idle');
        return;
      }

      clearSilenceTimer();
      stopBargeVad();
      // Thinking before any abort side-effects so delayed listen restarts stay gated.
      setSessionStateSafe('thinking');
      setError(null);
      stopListening();

      const { historyBefore, nextHistory } = buildVoicePilotTurnHistory(
        turnHistoryRef.current,
        text,
        VOICE_AGENT_CONFIG.maxChatHistoryMessages,
      );
      turnHistoryRef.current = nextHistory;

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      voiceAudioSession.stop();

      const voiceMeta = {
        voice_id: bootstrapRef.current?.voice_id || 'pilot',
        name: bootstrapRef.current?.voice_name || 'Pilot',
      };

      let heardAudio = false;
      let fillerTimer: ReturnType<typeof setTimeout> | null = null;

      const cancelFiller = () => {
        if (fillerTimer) {
          clearTimeout(fillerTimer);
          fillerTimer = null;
        }
      };

      fillerTimer = setTimeout(() => {
        fillerTimer = null;
        if (
          gen !== sessionGenRef.current ||
          !agentActiveRef.current ||
          controller.signal.aborted ||
          heardAudio ||
          sessionStateRef.current !== 'thinking'
        ) {
          return;
        }
        const fillers = VOICE_AGENT_CONFIG.thinkingFillers;
        const pick = fillers[Math.floor(Math.random() * fillers.length)] || 'Hmm…';
        const voiceId = bootstrapRef.current?.voice_id;
        const voiceName = bootstrapRef.current?.voice_name || 'Pilot';
        if (!projectId || !voiceId) return;
        void (async () => {
          try {
            const blob = await chatbotVoicePilotTts(projectId, pick);
            if (
              gen !== sessionGenRef.current ||
              heardAudio ||
              controller.signal.aborted ||
              sessionStateRef.current !== 'thinking'
            ) {
              return;
            }
            await voiceAudioSession.playBlob(blob, { voice_id: voiceId, name: voiceName });
          } catch {
            /* filler is best-effort */
          }
        })();
      }, VOICE_AGENT_CONFIG.thinkingFillerDelayMs);

      try {
        const finalAnswer = await chatbotVoicePilotTurnStream(
          projectId,
          text,
          {
            onSentence: ({ audio }) => {
              if (gen !== sessionGenRef.current || controller.signal.aborted) return;
              setSessionStateSafe('speaking');
              if (audio) {
                cancelFiller();
                if (!heardAudio) {
                  voiceAudioSession.stop();
                }
                heardAudio = true;
                voiceAudioSession.enqueueBlob(audio, voiceMeta);
              }
            },
            onClearAudio: () => {
              voiceAudioSession.clearQueue();
              voiceAudioSession.stop();
              heardAudio = false;
            },
            onTtsWarning: (message) => {
              if (gen === sessionGenRef.current) setError(message);
            },
          },
          controller.signal,
          historyBefore,
        );

        cancelFiller();

        if (gen !== sessionGenRef.current || controller.signal.aborted) return;
        if (finalAnswer) {
          turnHistoryRef.current = [
            ...turnHistoryRef.current,
            { role: 'assistant' as const, content: finalAnswer },
          ].slice(-VOICE_AGENT_CONFIG.maxChatHistoryMessages);
        }

        if (!heardAudio) {
          const answer = (finalAnswer || '').trim();
          if (!answer) {
            setError(t('voicePilot.speak.noAnswer'));
            if (agentActiveRef.current) {
              await settleAfterSpeech();
              if (gen === sessionGenRef.current && agentActiveRef.current) {
                followUpSpokenRef.current = false;
                silencePhaseRef.current = 'none';
                suppressBargeRef.current = false;
                enterListeningRef.current();
              }
            } else {
              setSessionStateSafe('idle');
            }
            return;
          }
          await speakControlRef.current(answer, gen);
          if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
          followUpSpokenRef.current = false;
          silencePhaseRef.current = 'none';
          suppressBargeRef.current = false;
          enterListeningRef.current();
          return;
        }

        await voiceAudioSession.waitUntilIdle();
        if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
        await settleAfterSpeech();
        if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
        followUpSpokenRef.current = false;
        silencePhaseRef.current = 'none';
        clearSilenceTimer();
        suppressBargeRef.current = false;
        enterListeningRef.current();
      } catch (err) {
        cancelFiller();
        if (controller.signal.aborted || gen !== sessionGenRef.current) return;
        setError(err instanceof Error ? err.message : t('voicePilot.error.voiceTurnFailed'));
        if (agentActiveRef.current) {
          await settleAfterSpeech();
          if (gen === sessionGenRef.current && agentActiveRef.current) {
            followUpSpokenRef.current = false;
            silencePhaseRef.current = 'none';
            suppressBargeRef.current = false;
            enterListeningRef.current();
          }
        } else {
          setSessionStateSafe('idle');
        }
      } finally {
        cancelFiller();
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [clearSilenceTimer, projectId, setSessionStateSafe, stopBargeVad, stopListening, t],
  );

  const startListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setMicError('unsupported');
      setError(t('voicePilot.error.noMicrophone'));
      setSessionStateSafe('error');
      return;
    }
    const sessionGen = sessionGenRef.current;
    stopBargeVad();
    stopListening();
    const listenGen = listenGenerationRef.current;
    setSessionStateSafe('listening');
    const locale = options?.language || bootstrapRef.current?.stt_locale || 'en-US';
    const recognizer = createPilotRecognizer(locale);
    if (!recognizer) {
      setMicError('unsupported');
      setError(t('voicePilot.error.noMicrophone'));
      setSessionStateSafe('error');
      return;
    }
    recognizerRef.current = recognizer;
    let finalText = '';
    let interimText = '';

    const bumpActivity = () => {
      clearSilenceTimer();
      if (agentActiveRef.current && sessionGen === sessionGenRef.current) {
        const phase = followUpSpokenRef.current ? 'second' : 'first';
        scheduleSilenceTimer(phase, sessionGen);
      }
    };

    recognizer.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const chunk = result[0]?.transcript || '';
        if (result.isFinal) {
          finalText = `${finalText} ${chunk}`.trim();
        } else {
          interim += chunk;
        }
      }
      interimText = interim || finalText;
      if (interim || finalText) bumpActivity();
    };

    recognizer.onerror = (event) => {
      if (
        !shouldProcessRecognizerEnd({
          listenGen,
          currentGen: listenGenerationRef.current,
        })
      ) {
        return;
      }
      const code = event.error || 'unknown';
      if (code === 'aborted' || code === 'no-speech') {
        if (!agentActiveRef.current) setSessionStateSafe('idle');
        return;
      }
      if (agentActiveRef.current) {
        setTimeout(() => {
          if (
            sessionGen === sessionGenRef.current &&
            shouldProcessRecognizerEnd({
              listenGen,
              currentGen: listenGenerationRef.current,
            }) &&
            shouldRestartVoicePilotListen(agentActiveRef.current, sessionStateRef.current)
          ) {
            enterListeningRef.current();
          }
        }, 400);
      } else {
        setSessionStateSafe('error');
      }
    };

    recognizer.onend = () => {
      recognizerRef.current = null;
      if (
        !shouldProcessRecognizerEnd({
          listenGen,
          currentGen: listenGenerationRef.current,
        })
      ) {
        return;
      }
      const text = resolveSpeechEndTranscript(finalText, interimText);
      interimText = '';
      if (text) {
        void handleFinalTranscript(text);
        return;
      }
      // Empty end — silence timer owns follow-up; only restart recognizer if still listening.
      if (
        sessionGen === sessionGenRef.current &&
        shouldRestartVoicePilotListen(agentActiveRef.current, sessionStateRef.current)
      ) {
        setTimeout(() => {
          if (
            sessionGen === sessionGenRef.current &&
            shouldProcessRecognizerEnd({
              listenGen,
              currentGen: listenGenerationRef.current,
            }) &&
            shouldRestartVoicePilotListen(agentActiveRef.current, sessionStateRef.current)
          ) {
            enterListeningRef.current();
          }
        }, 250);
      }
    };

    try {
      recognizer.start();
      if (agentActiveRef.current && !silenceTimerRef.current) {
        const phase = followUpSpokenRef.current ? 'second' : 'first';
        scheduleSilenceTimer(phase, sessionGen);
      }
    } catch {
      setError(t('voicePilot.error.listenStartFailed'));
      setSessionStateSafe('error');
    }
  }, [
    clearSilenceTimer,
    handleFinalTranscript,
    options?.language,
    scheduleSilenceTimer,
    setSessionStateSafe,
    stopBargeVad,
    stopListening,
    t,
  ]);
  enterListeningRef.current = startListening;

  const startAgentSession = useCallback(async () => {
    if (previewMode || !projectId) return;
    if (!bootstrapRef.current?.voice_id) {
      setError(t('voicePilot.error.selectVoiceFirst'));
      return;
    }
    if (bootstrapRef.current.provider === 'elevenlabs' && !bootstrapRef.current.has_api_key) {
      setError(t('voicePilot.error.addApiKeyFirst'));
      return;
    }

    sessionGenRef.current += 1;
    const gen = sessionGenRef.current;
    agentActiveRef.current = true;
    setAgentActive(true);
    followUpSpokenRef.current = false;
    silencePhaseRef.current = 'none';
    suppressBargeRef.current = false;
    turnHistoryRef.current = [];
    clearSilenceTimer();
    stopBargeVad();
    stopListening();
    stopAudio();
    setError(null);
    setMicError('none');
    setSessionStateSafe('connecting');

    const probe = await probePilotMicrophone();
    if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
    if (probe === 'not_found' || probe === 'unsupported') {
      setMicError(probe === 'unsupported' ? 'unsupported' : 'not_found');
      setError(t('voicePilot.error.noMicrophone'));
      endAgentSessionRef.current();
      return;
    }
    if (probe === 'denied') {
      setMicError('denied');
      setError(t('voicePilot.error.micDenied'));
      endAgentSessionRef.current();
      return;
    }

    await settleAfterSpeech();
    if (gen !== sessionGenRef.current || !agentActiveRef.current) return;

    const opening =
      bootstrapRef.current.preview_text?.trim() ||
      t('voicePilot.greeting.default');
    await speakControl(opening, gen, { holdConnecting: true });
    if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
    enterListeningRef.current();
  }, [
    clearSilenceTimer,
    previewMode,
    projectId,
    setSessionStateSafe,
    speakControl,
    stopAudio,
    stopBargeVad,
    stopListening,
    t,
  ]);

  const onOrbPress = useCallback(() => {
    if (previewMode) return;
    if (agentActiveRef.current) {
      endAgentSession();
      return;
    }
    void startAgentSession();
  }, [endAgentSession, previewMode, startAgentSession]);

  /** Composer / host text → same path as a final STT transcript (no chat bubbles). */
  const submitText = useCallback(
    (raw: string) => {
      if (previewMode || !projectId) return;
      const text = raw.trim();
      if (!text) return;
      if (!bootstrapRef.current?.voice_id) {
        setError(t('voicePilot.error.selectVoiceFirst'));
        return;
      }
      if (
        bootstrapRef.current.provider === 'elevenlabs' &&
        !bootstrapRef.current.has_api_key
      ) {
        setError(t('voicePilot.error.addApiKeyFirst'));
        return;
      }
      setMicError('none');
      setError(null);
      if (!agentActiveRef.current) {
        sessionGenRef.current += 1;
        agentActiveRef.current = true;
        setAgentActive(true);
        followUpSpokenRef.current = false;
        silencePhaseRef.current = 'none';
        turnHistoryRef.current = [];
      }
      // Composer text: suppress barge-in so typing/mic noise cannot abort the answer.
      suppressBargeRef.current = true;
      stopBargeVad();
      clearSilenceTimer();
      setSessionStateSafe('thinking');
      stopListening();
      stopAudio();
      void handleFinalTranscript(text);
    },
    [
      clearSilenceTimer,
      handleFinalTranscript,
      previewMode,
      projectId,
      setSessionStateSafe,
      stopAudio,
      stopBargeVad,
      stopListening,
    ],
  );

  useEffect(() => {
    return () => {
      endAgentSessionRef.current();
    };
  }, []);

  const orbVisualState =
    sessionState === 'speaking'
      ? 'speaking'
      : sessionState === 'listening'
        ? 'listening'
        : sessionState === 'thinking' || sessionState === 'connecting'
          ? 'thinking'
          : 'idle';

  return {
    loading,
    bootstrap,
    error,
    micError,
    sessionState,
    agentActive,
    orbBands,
    orbIntensity,
    orbVisualState: orbVisualState as 'idle' | 'listening' | 'speaking' | 'thinking',
    voiceId: bootstrap?.voice_id ?? null,
    onOrbPress,
    submitText,
    endAgentSession,
  };
}
