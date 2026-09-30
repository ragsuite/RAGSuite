import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  VoicePilotPrimaryTab,
  VoicePilotProvider,
  VoicePilotSessionState,
  VoicePilotSettings,
  VoicePilotSettingsSection,
  VoicePilotSettingsUpdate,
  VoicePilotVoice,
  VoicePilotVoiceConfig,
} from '@/features/ai-voice-pilot/types/voice-pilot.types';
import {
  DEFAULT_VOICE_PREVIEW_TEXT,
  VOICE_CONFIG_DEFAULTS,
  findDefaultCustomVoiceIndex,
  normalizeVoiceConfig,
  voiceConfigsEqual,
} from '@/features/ai-voice-pilot/types/voice-pilot.types';
import {
  getVoicePilotSettings,
  listVoicePilotVoices,
  playAudioBlob,
  previewVoicePilotTts,
  putVoicePilotSettings,
  speakVoicePilotTts,
  testVoicePilotApiKey,
  voicePilotTurn,
  voicePilotTurnStream,
} from '@/features/ai-voice-pilot/services/voice-pilot.service';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';
import { useToast } from '@/shared/toast/use-toast';
import {
  createPilotRecognizer,
  isSpeechRecognitionSupported,
} from '@/features/ai-voice-pilot/utils/pilot-speech';
import {
  classifySpeechMicError,
  probePilotMicrophone,
} from '@/features/ai-voice-pilot/utils/pilot-mic';
import { startPilotBargeInVad, type PilotVadHandle } from '@/features/ai-voice-pilot/utils/pilot-vad';
import type { OrbVisualState } from '@/features/ai-voice-pilot/components/audio-reactive-orb/orbShaders';
import {
  VOICE_AGENT_CONFIG,
  type VoiceAgentChatMessage,
} from '@/features/ai-voice-pilot/utils/voice-agent-config';
import {
  voiceAudioSession,
  type VoiceAudioSnapshot,
} from '@/features/ai-voice-pilot/utils/voice-audio-session';
import {
  filterWorkingVoices,
  seedTrendingVoices,
} from '@/features/ai-voice-pilot/utils/voice-trending';

export function useVoicePilot() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeProjectId, hasPermission } = useActiveProject();
  const projectId = activeProjectId ?? '';

  const [primaryTab, setPrimaryTab] = useState<VoicePilotPrimaryTab>('pilot');
  const [settingsSection, setSettingsSection] = useState<VoicePilotSettingsSection>('provider');
  const [settings, setSettings] = useState<VoicePilotSettings | null>(null);
  const [voices, setVoices] = useState<VoicePilotVoice[]>([]);
  const [trendingVoices, setTrendingVoices] = useState<VoicePilotVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<VoicePilotSessionState>('idle');
  const [agentActive, setAgentActive] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastAnswer, setLastAnswer] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [localeDraft, setLocaleDraft] = useState('en-US');
  const [previewTextByProvider, setPreviewTextByProvider] = useState<
    Record<VoicePilotProvider, string>
  >({
    elevenlabs: DEFAULT_VOICE_PREVIEW_TEXT,
    custom: DEFAULT_VOICE_PREVIEW_TEXT,
  });
  const [previewBusy, setPreviewBusy] = useState(false);
  const [voiceCarouselIndex, setVoiceCarouselIndex] = useState(0);
  const [audioSnap, setAudioSnap] = useState<VoiceAudioSnapshot>(voiceAudioSession.getSnapshot());
  const [audioIntensity, setAudioIntensity] = useState(0);
  const [orbSpectrum, setOrbSpectrum] = useState<number[]>(() => voiceAudioSession.getSpectrum());
  const [orbBands, setOrbBands] = useState(() => voiceAudioSession.getAudioBands());
  const [phaseIntensity, setPhaseIntensity] = useState(0);
  const [playbackSource, setPlaybackSource] = useState<'sample' | 'typed' | null>(null);
  const playbackSourceRef = useRef<'sample' | 'typed' | null>(null);
  playbackSourceRef.current = playbackSource;

  const [voiceConfigMode, setVoiceConfigMode] = useState(false);
  const [configVoiceId, setConfigVoiceId] = useState<string | null>(null);
  const [draftVoiceConfig, setDraftVoiceConfigState] = useState<VoicePilotVoiceConfig>(
    VOICE_CONFIG_DEFAULTS,
  );
  const [applyingVoiceConfig, setApplyingVoiceConfig] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const recognizerRef = useRef<ReturnType<typeof createPilotRecognizer> | null>(null);
  const settingsRef = useRef(settings);
  const interimRef = useRef('');
  const previewTextRef = useRef(DEFAULT_VOICE_PREVIEW_TEXT);
  const previewSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Per-provider catalog cache — avoids flicker / wait on ElevenLabs↔Custom switch. */
  const voicesByProviderRef = useRef<Partial<Record<VoicePilotProvider, VoicePilotVoice[]>>>({});
  const agentActiveRef = useRef(false);
  const sessionGenRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silencePhaseRef = useRef<'none' | 'first' | 'second'>('none');
  const followUpSpokenRef = useRef(false);
  const turnHistoryRef = useRef<VoiceAgentChatMessage[]>([]);
  const bargeVadRef = useRef<PilotVadHandle | null>(null);
  const sessionStateRef = useRef<VoicePilotSessionState>('idle');
  const enterListeningRef = useRef<() => void>(() => undefined);
  const handleFinalTranscriptRef = useRef<(text: string) => void>(() => undefined);
  const endAgentSessionRef = useRef<(opts?: { speakGoodbye?: boolean }) => void>(() => undefined);

  settingsRef.current = settings;
  agentActiveRef.current = agentActive;
  sessionStateRef.current = sessionState;

  const voiceProvider: VoicePilotProvider =
    settings?.voice_provider === 'custom' ? 'custom' : 'elevenlabs';
  const isCustomProvider = voiceProvider === 'custom';
  const previewText = previewTextByProvider[voiceProvider];
  previewTextRef.current = previewText;
  const providerReady = isCustomProvider
    ? Boolean(settings?.selected_voice_id)
    : Boolean(settings?.has_api_key && settings?.selected_voice_id);

  const canUse = hasPermission('voice_pilot:use') || hasPermission('voice_pilot:settings');
  const canSettings = hasPermission('voice_pilot:settings');

  const activeProvider = (): VoicePilotProvider =>
    settingsRef.current?.voice_provider === 'custom' ? 'custom' : 'elevenlabs';

  const workingVoices = useMemo(() => filterWorkingVoices(voices), [voices]);
  const trendingIds = useMemo(
    () => new Set(trendingVoices.map((voice) => voice.voice_id)),
    [trendingVoices],
  );

  useEffect(
    () =>
      voiceAudioSession.subscribe((snap) => {
        setAudioSnap(snap);
        if (!snap.voiceId) {
          setPlaybackSource(null);
          playbackSourceRef.current = null;
        }
      }),
    [],
  );

  useEffect(() => voiceAudioSession.subscribeIntensity(setAudioIntensity), []);
  useEffect(() => voiceAudioSession.subscribeSpectrum(setOrbSpectrum), []);
  useEffect(() => voiceAudioSession.subscribeAudioBands(setOrbBands), []);

  // Soft phase pulse when connecting/listening/thinking (or speaking before first audio).
  useEffect(() => {
    const needsPhase =
      sessionState === 'connecting' ||
      sessionState === 'listening' ||
      sessionState === 'thinking' ||
      (sessionState === 'speaking' && !audioSnap.playing);
    if (!needsPhase) {
      setPhaseIntensity(0);
      return;
    }
    let raf = 0;
    const started = performance.now();
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      if (sessionState === 'connecting') {
        setPhaseIntensity(0.14 + 0.1 * Math.sin(t * Math.PI * 2.4));
      } else if (sessionState === 'listening') {
        setPhaseIntensity(0.18 + 0.12 * Math.sin(t * Math.PI * 1.6));
      } else if (sessionState === 'thinking') {
        setPhaseIntensity(0.28 + 0.2 * Math.abs(Math.sin(t * Math.PI * 3.2)));
      } else {
        setPhaseIntensity(0.32 + 0.18 * Math.sin(t * Math.PI * 2.1));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioSnap.playing, sessionState]);

  const orbIntensity = audioSnap.playing && !audioSnap.paused ? audioIntensity : phaseIntensity;
  const liveOrbSpectrum =
    audioSnap.playing && !audioSnap.paused ? orbSpectrum : undefined;
  const liveOrbBands =
    audioSnap.playing && !audioSnap.paused
      ? orbBands
      : {
          bass: phaseIntensity * 0.5,
          mid: phaseIntensity * 0.7,
          high: phaseIntensity * 0.4,
          rms: phaseIntensity,
          peak: 0,
        };
  const orbVisualState: OrbVisualState =
    sessionState === 'connecting' ||
    sessionState === 'listening' ||
    sessionState === 'thinking' ||
    sessionState === 'speaking'
      ? sessionState === 'connecting'
        ? 'thinking'
        : sessionState
      : 'idle';

  const applyVoicesList = useCallback(
    (
      list: VoicePilotVoice[],
      selectedVoiceId?: string | null,
      provider?: VoicePilotProvider,
    ) => {
      const prov =
        provider ?? (settingsRef.current?.voice_provider === 'custom' ? 'custom' : 'elevenlabs');
      if (list.length > 0) {
        voicesByProviderRef.current[prov] = list;
      }
      setVoices(list);
      // Custom: full catalog. ElevenLabs: all returned voices (not only those with sample URL).
      const working = prov === 'custom' ? list : filterWorkingVoices(list);
      const carouselSource = prov === 'custom' ? list : list.length ? list : working;
      const seeded = seedTrendingVoices(carouselSource.length ? carouselSource : working);
      setTrendingVoices(seeded);
      // Both Custom and ElevenLabs list panels use the full API list order.
      const indexSource = list;
      const selectedIdx = selectedVoiceId
        ? indexSource.findIndex((v) => v.voice_id === selectedVoiceId)
        : -1;
      if (selectedIdx >= 0) {
        setVoiceCarouselIndex(selectedIdx);
      } else if (prov === 'custom') {
        setVoiceCarouselIndex(findDefaultCustomVoiceIndex(list));
      } else {
        setVoiceCarouselIndex(0);
      }
    },
    [],
  );

  const stopPilotAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const stopPreviewAudio = useCallback(() => {
    voiceAudioSession.stop();
  }, []);

  const stopAudio = useCallback(() => {
    stopPilotAudio();
    stopPreviewAudio();
  }, [stopPilotAudio, stopPreviewAudio]);

  const stopListening = useCallback(() => {
    try {
      recognizerRef.current?.abort();
    } catch {
      /* ignore */
    }
    recognizerRef.current = null;
  }, []);

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

  const cancelSession = useCallback(() => {
    sessionGenRef.current += 1;
    agentActiveRef.current = false;
    setAgentActive(false);
    followUpSpokenRef.current = false;
    silencePhaseRef.current = 'none';
    turnHistoryRef.current = [];
    clearSilenceTimer();
    stopBargeVad();
    stopListening();
    stopAudio();
    setInterimTranscript('');
    setSessionState('idle');
  }, [clearSilenceTimer, stopAudio, stopBargeVad, stopListening]);

  const speakControlUtterance = useCallback(
    async (text: string, gen: number) => {
      if (!projectId || !text.trim()) return;
      const voiceId = settingsRef.current?.selected_voice_id;
      const voiceName = settingsRef.current?.selected_voice_name || 'Pilot';
      if (!voiceId) return;
      setSessionState('speaking');
      try {
        const blob = await previewVoicePilotTts(
          projectId,
          text.trim(),
          voiceId,
          activeProvider(),
        );
        if (gen !== sessionGenRef.current) return;
        await voiceAudioSession.playBlob(blob, { voice_id: voiceId, name: voiceName });
        await voiceAudioSession.waitUntilIdle();
      } catch (err) {
        if (gen === sessionGenRef.current) {
          setError(err instanceof Error ? err.message : 'Could not speak');
        }
      }
    },
    [projectId],
  );

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
            await speakControlUtterance(VOICE_AGENT_CONFIG.followUpMessage, gen);
            if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
            enterListeningRef.current();
            scheduleSilenceTimer('second', gen);
          } else {
            stopListening();
            await speakControlUtterance(VOICE_AGENT_CONFIG.endMessage, gen);
            endAgentSessionRef.current();
          }
        })();
      }, ms);
    },
    [clearSilenceTimer, speakControlUtterance, stopListening],
  );

  const applyPreviewTextFromSettings = useCallback((next: VoicePilotSettings) => {
    const provider: VoicePilotProvider =
      next.voice_provider === 'custom' ? 'custom' : 'elevenlabs';
    // Prefer API value when present; only fall back when missing.
    const raw = next.preview_text;
    const text =
      typeof raw === 'string' && raw.length > 0
        ? raw
        : DEFAULT_VOICE_PREVIEW_TEXT;
    setPreviewTextByProvider((prev) => {
      if (prev[provider] === text) return prev;
      return { ...prev, [provider]: text };
    });
  }, []);

  const reload = useCallback(async () => {
    if (!projectId) {
      setSettings(null);
      setVoices([]);
      setTrendingVoices([]);
      voicesByProviderRef.current = {};
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getVoicePilotSettings(projectId);
      setSettings(next);
      setLocaleDraft(next.stt_locale || 'en-US');
      applyPreviewTextFromSettings(next);
      const prov: VoicePilotProvider =
        next.voice_provider === 'custom' ? 'custom' : 'elevenlabs';
      if (next.voice_provider === 'custom' || next.has_api_key) {
        try {
          const list = await listVoicePilotVoices(projectId, prov);
          applyVoicesList(list, next.selected_voice_id, prov);
        } catch (voiceErr) {
          setVoices([]);
          setTrendingVoices([]);
          setError(voiceErr instanceof Error ? voiceErr.message : 'Failed to load voices');
        }
      } else {
        setVoices([]);
        setTrendingVoices([]);
        setVoiceCarouselIndex(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Voice Pilot settings');
    } finally {
      setLoading(false);
    }
  }, [applyPreviewTextFromSettings, applyVoicesList, projectId]);

  useEffect(() => {
    void reload();
    return () => {
      cancelSession();
    };
  }, [reload, cancelSession]);

  const saveSettings = useCallback(
    async (
      payload: VoicePilotSettingsUpdate,
      options?: { toastOnSuccess?: 'apiKey' | 'settings' | 'voice' | 'config' | 'none' },
    ) => {
      if (!projectId) return;
      const toastMode = options?.toastOnSuccess ?? (payload.elevenlabs_api_key ? 'apiKey' : 'settings');
      setSaving(true);
      setError(null);

      const finishToasts = () => {
        if (toastMode === 'apiKey') {
          toast({ title: t('voicePilot.toast.apiKeySaved') });
        } else if (toastMode === 'settings') {
          toast({ title: t('voicePilot.toast.settingsSaved') });
        } else if (toastMode === 'voice') {
          toast({ title: t('voicePilot.toast.voiceSelected') });
        } else if (toastMode === 'config') {
          toast({ title: t('voicePilot.voices.config.applied') });
        }
      };

      try {
        const switchingProvider = payload.voice_provider !== undefined;
        const refreshingAfterKey = payload.elevenlabs_api_key !== undefined;

        // Provider switch: never paint old catalog — load target list (cache or fetch)
        // in parallel with PUT, then apply settings + voices + index together.
        if (switchingProvider) {
          const targetProvider: VoicePilotProvider =
            payload.voice_provider === 'custom' ? 'custom' : 'elevenlabs';
          const cached = voicesByProviderRef.current[targetProvider];
          const putPromise = putVoicePilotSettings(projectId, payload);

          if (cached && cached.length > 0) {
            const next = await putPromise;
            setSettings(next);
            applyPreviewTextFromSettings(next);
            applyVoicesList(cached, next.selected_voice_id, targetProvider);
            finishToasts();
            void listVoicePilotVoices(projectId, targetProvider)
              .then((fresh) => {
                if (!fresh.length) return;
                voicesByProviderRef.current[targetProvider] = fresh;
                const still: VoicePilotProvider =
                  settingsRef.current?.voice_provider === 'custom' ? 'custom' : 'elevenlabs';
                if (still === targetProvider) {
                  applyVoicesList(fresh, settingsRef.current?.selected_voice_id, targetProvider);
                }
              })
              .catch(() => undefined);
            return next;
          }

          const [next, fetched] = await Promise.all([
            putPromise,
            listVoicePilotVoices(projectId, targetProvider).catch(() => [] as VoicePilotVoice[]),
          ]);
          setSettings(next);
          applyPreviewTextFromSettings(next);
          applyVoicesList(fetched, next.selected_voice_id, targetProvider);
          finishToasts();
          return next;
        }

        // API key save: PUT first (list needs stored key), then batch settings + voices.
        if (refreshingAfterKey) {
          const next = await putVoicePilotSettings(projectId, payload);
          const prov: VoicePilotProvider =
            next.voice_provider === 'custom' ? 'custom' : 'elevenlabs';
          setApiKeyDraft('');
          let list: VoicePilotVoice[] = [];
          if (prov === 'custom' || next.has_api_key) {
            try {
              list = await listVoicePilotVoices(projectId, prov);
            } catch {
              list = [];
            }
          }
          setSettings(next);
          if (list.length > 0 || prov === 'custom') {
            applyVoicesList(list, next.selected_voice_id, prov);
          } else {
            setVoices([]);
            setTrendingVoices([]);
            setVoiceCarouselIndex(0);
          }
          finishToasts();
          return next;
        }

        const next = await putVoicePilotSettings(projectId, payload);
        setSettings(next);
        finishToasts();
        return next;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save settings';
        setError(message);
        toast({
          title: t('voicePilot.toast.saveFailed'),
          description: message,
          variant: 'destructive',
        });
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [applyPreviewTextFromSettings, applyVoicesList, projectId, t, toast],
  );

  const setPreviewText = useCallback(
    (value: string) => {
      setPreviewTextByProvider((prev) => ({ ...prev, [voiceProvider]: value }));
      if (!projectId) return;
      if (previewSaveTimerRef.current) {
        clearTimeout(previewSaveTimerRef.current);
      }
      // Persist quietly — do not use saveSettings (setSaving / re-hydrate fight typing).
      previewSaveTimerRef.current = setTimeout(() => {
        previewSaveTimerRef.current = null;
        void putVoicePilotSettings(projectId, { preview_text: value })
          .then((next) => {
            // Update settings metadata only — keep local previewTextByProvider as source of truth.
            setSettings(next);
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : 'Failed to save preview text';
            setError(message);
          });
      }, 500);
    },
    [projectId, voiceProvider],
  );

  useEffect(
    () => () => {
      if (previewSaveTimerRef.current) {
        clearTimeout(previewSaveTimerRef.current);
        previewSaveTimerRef.current = null;
      }
    },
    [],
  );

  const testKey = useCallback(async () => {
    if (!projectId) return;
    setTestingKey(true);
    setError(null);
    try {
      const result = await testVoicePilotApiKey(projectId, apiKeyDraft || undefined);
      if (!result.ok) {
        const message = result.message || 'Key test failed';
        setError(message);
        toast({
          title: t('voicePilot.toast.testFailed'),
          description: message,
          variant: 'destructive',
        });
      } else {
        toast({ title: t('voicePilot.toast.testOk') });
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Key test failed';
      setError(message);
      toast({
        title: t('voicePilot.toast.testFailed'),
        description: message,
        variant: 'destructive',
      });
      return { ok: false, message };
    } finally {
      setTestingKey(false);
    }
  }, [apiKeyDraft, projectId, t, toast]);

  const selectVoice = useCallback(
    async (voice: VoicePilotVoice) => {
      await saveSettings(
        {
          selected_voice_id: voice.voice_id,
          selected_voice_name: voice.name,
        },
        { toastOnSuccess: 'voice' },
      );
      setError(null);
    },
    [saveSettings],
  );

  const appliedVoiceConfig = useCallback(
    (voiceId: string | null | undefined): VoicePilotVoiceConfig => {
      if (!voiceId) return { ...VOICE_CONFIG_DEFAULTS };
      const stored = settings?.voice_configurations?.[voiceId];
      return normalizeVoiceConfig(stored as Partial<VoicePilotVoiceConfig> | null | undefined);
    },
    [settings?.voice_configurations],
  );

  const configVoice = useMemo(() => {
    if (!configVoiceId) return null;
    return (
      trendingVoices.find((v) => v.voice_id === configVoiceId) ||
      voices.find((v) => v.voice_id === configVoiceId) ||
      null
    );
  }, [configVoiceId, trendingVoices, voices]);

  const configVoiceIndex = useMemo(() => {
    if (!configVoiceId) return -1;
    if (isCustomProvider) {
      return voices.findIndex((v) => v.voice_id === configVoiceId);
    }
    const idx = trendingVoices.findIndex((v) => v.voice_id === configVoiceId);
    return idx >= 0 ? idx : voices.findIndex((v) => v.voice_id === configVoiceId);
  }, [configVoiceId, isCustomProvider, trendingVoices, voices]);

  const hasUnsavedVoiceConfig = useMemo(() => {
    if (!configVoiceId) return false;
    return !voiceConfigsEqual(draftVoiceConfig, appliedVoiceConfig(configVoiceId));
  }, [appliedVoiceConfig, configVoiceId, draftVoiceConfig]);

  const openVoiceConfiguration = useCallback(
    (voice: VoicePilotVoice) => {
      setConfigVoiceId(voice.voice_id);
      setDraftVoiceConfigState(appliedVoiceConfig(voice.voice_id));
      setVoiceConfigMode(true);
      setError(null);
    },
    [appliedVoiceConfig],
  );

  const closeVoiceConfiguration = useCallback(() => {
    setVoiceConfigMode(false);
    setConfigVoiceId(null);
    setDraftVoiceConfigState(VOICE_CONFIG_DEFAULTS);
  }, []);

  const setDraftVoiceConfig = useCallback((patch: Partial<VoicePilotVoiceConfig>) => {
    setDraftVoiceConfigState((prev) => normalizeVoiceConfig({ ...prev, ...patch }));
  }, []);

  const resetDraftVoiceConfigToDefaults = useCallback(() => {
    setDraftVoiceConfigState({ ...VOICE_CONFIG_DEFAULTS });
  }, []);

  const applyVoiceConfiguration = useCallback(async () => {
    if (!configVoiceId) return;
    setApplyingVoiceConfig(true);
    try {
      const draft = normalizeVoiceConfig(draftVoiceConfig);
      const isDefault = voiceConfigsEqual(draft, VOICE_CONFIG_DEFAULTS);
      await saveSettings(
        {
          voice_configurations: {
            [configVoiceId]: isDefault ? null : draft,
          },
        },
        { toastOnSuccess: 'config' },
      );
      setDraftVoiceConfigState(draft);
    } finally {
      setApplyingVoiceConfig(false);
    }
  }, [configVoiceId, draftVoiceConfig, saveSettings]);

  const stopVoicePreview = useCallback(() => {
    voiceAudioSession.stop();
    setPlaybackSource(null);
    playbackSourceRef.current = null;
  }, []);

  const addToTrending = useCallback((voice: VoicePilotVoice) => {
    setTrendingVoices((prev) => {
      if (prev.some((item) => item.voice_id === voice.voice_id)) return prev;
      const next = [...prev, voice];
      setVoiceCarouselIndex(next.length - 1);
      return next;
    });
  }, []);

  const setPrimaryTabSafe = useCallback((tab: VoicePilotPrimaryTab) => {
    setPrimaryTab(tab);
    setError(null);
    if (tab !== 'voices') {
      setVoiceConfigMode(false);
      setConfigVoiceId(null);
    }
  }, []);

  const startSamplePreview = useCallback(
    async (voice: VoicePilotVoice) => {
      if (!projectId) return;
      const url = voice.preview_url?.trim();
      const isCustom = activeProvider() === 'custom' || voice.provider === 'custom';

      setPreviewBusy(true);
      setError(null);
      stopPilotAudio();
      stopPreviewAudio();
      try {
        setPlaybackSource('sample');
        playbackSourceRef.current = 'sample';
        if (url) {
          await voiceAudioSession.playUrl(url, voice);
        } else {
          setError(
            isCustom
              ? 'This voice has no predefined sample'
              : 'This voice has no ElevenLabs sample',
          );
          setPlaybackSource(null);
          playbackSourceRef.current = null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sample preview failed');
        voiceAudioSession.stop();
        setPlaybackSource(null);
        playbackSourceRef.current = null;
      } finally {
        setPreviewBusy(false);
      }
    },
    [projectId, stopPilotAudio, stopPreviewAudio],
  );

  const startTypedPreview = useCallback(
    async (voice: VoicePilotVoice) => {
      if (!projectId) return;
      setPreviewBusy(true);
      setError(null);
      stopPilotAudio();
      stopPreviewAudio();
      try {
        const text = previewTextRef.current.trim() || DEFAULT_VOICE_PREVIEW_TEXT;
        setPlaybackSource('typed');
        playbackSourceRef.current = 'typed';
        const blob = await previewVoicePilotTts(
          projectId,
          text,
          voice.voice_id,
          activeProvider(),
        );
        await voiceAudioSession.playBlob(blob, voice);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Preview failed');
        voiceAudioSession.stop();
        setPlaybackSource(null);
        playbackSourceRef.current = null;
      } finally {
        setPreviewBusy(false);
      }
    },
    [projectId, stopPilotAudio, stopPreviewAudio],
  );

  const toggleSamplePreview = useCallback(
    (voice: VoicePilotVoice) => {
      const snap = voiceAudioSession.getSnapshot();
      if (
        snap.voiceId === voice.voice_id &&
        playbackSourceRef.current === 'sample' &&
        (snap.playing || snap.paused)
      ) {
        voiceAudioSession.togglePause();
        return;
      }
      void startSamplePreview(voice);
    },
    [startSamplePreview],
  );

  const speakTypedPreview = useCallback(
    (voice: VoicePilotVoice) => {
      const snap = voiceAudioSession.getSnapshot();
      if (
        snap.voiceId === voice.voice_id &&
        playbackSourceRef.current === 'typed' &&
        (snap.playing || snap.paused)
      ) {
        voiceAudioSession.togglePause();
        return;
      }
      void startTypedPreview(voice);
    },
    [startTypedPreview],
  );

  const togglePlaybackBar = useCallback(() => {
    const snap = voiceAudioSession.getSnapshot();
    if (!snap.voiceId) return;
    voiceAudioSession.togglePause();
  }, []);

  const runPreviewForVoice = useCallback(
    async (voice?: VoicePilotVoice | null) => {
      const target =
        voice ??
        trendingVoices[voiceCarouselIndex] ??
        workingVoices.find((item) => item.voice_id === settingsRef.current?.selected_voice_id) ??
        null;
      if (!target) {
        setError('Select a voice before previewing');
        return;
      }
      await startTypedPreview(target);
    },
    [startTypedPreview, trendingVoices, voiceCarouselIndex, workingVoices],
  );

  const speakAnswer = useCallback(
    async (answer: string) => {
      if (!projectId) return;
      stopAudio();
      const controller = new AbortController();
      abortRef.current = controller;
      setSessionState('speaking');
      const voiceId = settingsRef.current?.selected_voice_id;
      try {
        const blob = await speakVoicePilotTts(projectId, answer, voiceId, activeProvider());
        await playAudioBlob(blob, controller.signal);
        if (!controller.signal.aborted) {
          if (agentActiveRef.current) {
            enterListeningRef.current();
          } else {
            setSessionState('idle');
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const shortened = answer.split(/(?<=[.!?])\s+/)[0]?.trim() || answer.slice(0, 160).trim();
        try {
          if (shortened && shortened !== answer) {
            const blob = await speakVoicePilotTts(
              projectId,
              shortened,
              voiceId,
              activeProvider(),
            );
            await playAudioBlob(blob, controller.signal);
            if (!controller.signal.aborted) {
              if (agentActiveRef.current) enterListeningRef.current();
              else setSessionState('idle');
            }
            return;
          }
          const blob = await speakVoicePilotTts(
            projectId,
            shortened || answer,
            voiceId,
            activeProvider(),
          );
          await playAudioBlob(blob, controller.signal);
          if (!controller.signal.aborted) {
            if (agentActiveRef.current) enterListeningRef.current();
            else setSessionState('idle');
          }
        } catch {
          if (!controller.signal.aborted) {
            setSessionState(agentActiveRef.current ? 'listening' : 'idle');
            setError(
              err instanceof Error ? err.message : t('voicePilot.speak.ttsSoftFail'),
            );
            if (agentActiveRef.current) enterListeningRef.current();
          }
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [projectId, stopAudio, t],
  );

  const handleFinalTranscript = useCallback(
    async (transcript: string) => {
      const text = transcript.trim();
      const gen = sessionGenRef.current;
      if (!text || !projectId) {
        if (agentActiveRef.current) enterListeningRef.current();
        else setSessionState('idle');
        return;
      }
      clearSilenceTimer();
      stopBargeVad();
      setLastTranscript(text);
      setInterimTranscript('');
      setSessionState('thinking');
      setError(null);
      setLastAnswer('');

      const historyBefore = [...turnHistoryRef.current];
      turnHistoryRef.current = [
        ...turnHistoryRef.current,
        { role: 'user' as const, content: text },
      ].slice(-VOICE_AGENT_CONFIG.maxChatHistoryMessages);

      const controller = new AbortController();
      abortRef.current = controller;
      stopPreviewAudio();

      const voiceMeta = {
        voice_id: settingsRef.current?.selected_voice_id || 'pilot',
        name: settingsRef.current?.selected_voice_name || 'Pilot',
      };

      let heardAudio = false;
      let finalAnswer = '';
      let fillerTimer: ReturnType<typeof setTimeout> | null = null;

      const cancelFiller = () => {
        if (fillerTimer) {
          clearTimeout(fillerTimer);
          fillerTimer = null;
        }
      };

      // One-shot thinking filler only if answer audio is still pending after delay.
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
        const voiceId = settingsRef.current?.selected_voice_id;
        const voiceName = settingsRef.current?.selected_voice_name || 'Pilot';
        if (!projectId || !voiceId) return;
        void (async () => {
          try {
            const blob = await previewVoicePilotTts(
              projectId,
              pick,
              voiceId,
              activeProvider(),
            );
            if (
              gen !== sessionGenRef.current ||
              heardAudio ||
              controller.signal.aborted ||
              sessionStateRef.current !== 'thinking'
            ) {
              return;
            }
            // Soft transition only — do not steal the answer turn if it arrives mid-play.
            await voiceAudioSession.playBlob(blob, { voice_id: voiceId, name: voiceName });
          } catch {
            /* filler is best-effort */
          }
        })();
      }, VOICE_AGENT_CONFIG.thinkingFillerDelayMs);

      try {
        finalAnswer = await voicePilotTurnStream(
          projectId,
          text,
          {
            onPartial: (answer) => {
              if (gen !== sessionGenRef.current) return;
              if (answer) setLastAnswer(answer);
            },
            onClearAudio: () => {
              if (gen !== sessionGenRef.current) return;
              voiceAudioSession.clearQueue();
              voiceAudioSession.stop();
              heardAudio = false;
            },
            onSentence: ({ text: sentence, audio }) => {
              if (gen !== sessionGenRef.current) return;
              if (sentence) {
                setLastAnswer((prev) => {
                  const next = prev?.includes(sentence)
                    ? prev
                    : `${prev || ''} ${sentence}`.trim();
                  return next;
                });
              }
              if (audio) {
                cancelFiller();
                if (!heardAudio) {
                  // Drop any in-flight filler playback before answer audio.
                  voiceAudioSession.stop();
                }
                heardAudio = true;
                setSessionState('speaking');
                voiceAudioSession.enqueueBlob(audio, voiceMeta);
              }
            },
            onDone: (answer) => {
              if (gen !== sessionGenRef.current) return;
              if (answer) {
                finalAnswer = answer;
                setLastAnswer(answer);
              }
            },
            onTtsWarning: (message) => {
              if (gen !== sessionGenRef.current) return;
              setError(message);
            },
            onError: (message) => {
              if (gen !== sessionGenRef.current) return;
              setError(message);
            },
          },
          controller.signal,
          historyBefore,
          {
            provider: activeProvider(),
            voiceId: settingsRef.current?.selected_voice_id,
          },
        );

        cancelFiller();

        if (controller.signal.aborted || gen !== sessionGenRef.current) return;

        if (finalAnswer) {
          setLastAnswer(finalAnswer);
          turnHistoryRef.current = [
            ...turnHistoryRef.current,
            { role: 'assistant' as const, content: finalAnswer },
          ].slice(-VOICE_AGENT_CONFIG.maxChatHistoryMessages);
        }

        if (!heardAudio) {
          const answer = (finalAnswer || '').trim();
          if (!answer) {
            setSessionState('error');
            setError(t('voicePilot.speak.noAnswer'));
            if (agentActiveRef.current) enterListeningRef.current();
            return;
          }
          await speakAnswer(answer);
          return;
        }

        setSessionState('speaking');
        await voiceAudioSession.waitUntilIdle();
        if (controller.signal.aborted || gen !== sessionGenRef.current) return;
        if (agentActiveRef.current) {
          followUpSpokenRef.current = false;
          silencePhaseRef.current = 'none';
          clearSilenceTimer();
          enterListeningRef.current();
        } else {
          setSessionState('idle');
        }
      } catch (err) {
        cancelFiller();
        if (controller.signal.aborted || gen !== sessionGenRef.current) return;
        try {
          const turn = await voicePilotTurn(projectId, text, {
            chatHistory: historyBefore,
          });
          const answer = (turn.answer || '').trim();
          setLastAnswer(answer);
          if (!answer) {
            setSessionState('error');
            setError(t('voicePilot.speak.noAnswer'));
            if (agentActiveRef.current) enterListeningRef.current();
            return;
          }
          turnHistoryRef.current = [
            ...turnHistoryRef.current,
            { role: 'assistant' as const, content: answer },
          ].slice(-VOICE_AGENT_CONFIG.maxChatHistoryMessages);
          await speakAnswer(answer);
        } catch (fallbackErr) {
          setSessionState('error');
          setError(
            fallbackErr instanceof Error
              ? fallbackErr.message
              : err instanceof Error
                ? err.message
                : t('voicePilot.speak.ttsSoftFail'),
          );
          if (agentActiveRef.current) enterListeningRef.current();
        }
      } finally {
        cancelFiller();
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [clearSilenceTimer, projectId, speakAnswer, stopBargeVad, stopPreviewAudio, t],
  );

  handleFinalTranscriptRef.current = (text: string) => {
    void handleFinalTranscript(text);
  };

  const startListening = useCallback(() => {
    if (activeProvider() === 'elevenlabs' && !settingsRef.current?.has_api_key) {
      setPrimaryTab('settings');
      setSettingsSection('provider');
      return;
    }
    if (!settingsRef.current?.selected_voice_id) {
      setPrimaryTab('voices');
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      setError('Speech recognition is not supported in this browser');
      setSessionState('error');
      return;
    }

    const gen = sessionGenRef.current;
    stopBargeVad();
    // Do not stop TTS here when entering listen after agent speech — already idle.
    stopListening();
    setError(null);
    setInterimTranscript('');
    interimRef.current = '';
    setSessionState('listening');

    const recognizer = createPilotRecognizer(settingsRef.current?.stt_locale || 'en-US');
    if (!recognizer) {
      setError('Speech recognition is not available');
      setSessionState('error');
      return;
    }

    recognizerRef.current = recognizer;
    let finalText = '';

    const bumpActivity = () => {
      clearSilenceTimer();
      if (agentActiveRef.current && gen === sessionGenRef.current) {
        const phase = followUpSpokenRef.current ? 'second' : 'first';
        scheduleSilenceTimer(phase, gen);
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
      if (interim || finalText) bumpActivity();
      setInterimTranscript(interim || finalText);
      interimRef.current = interim || finalText;
    };

    recognizer.onerror = (event) => {
      const code = event.error || 'unknown';
      if (code === 'aborted') return;
      if (code === 'no-speech') {
        // Silence timer owns follow-up / end — stay listening if agent active.
        if (!agentActiveRef.current) setSessionState('idle');
        return;
      }
      const micKind = classifySpeechMicError(code);
      if (micKind === 'denied') {
        setError(t('voicePilot.error.micDenied'));
        endAgentSessionRef.current();
        return;
      }
      if (micKind === 'not_found') {
        setError(t('voicePilot.error.noMicrophone'));
        endAgentSessionRef.current();
        return;
      }
      setError(`Speech recognition error: ${code}`);
      if (agentActiveRef.current) {
        // Retry listen shortly
        setTimeout(() => {
          if (gen === sessionGenRef.current && agentActiveRef.current) {
            enterListeningRef.current();
          }
        }, 400);
      } else {
        setSessionState('error');
      }
    };

    recognizer.onend = () => {
      recognizerRef.current = null;
      const text = finalText.trim() || interimRef.current.trim();
      interimRef.current = '';
      if (text) {
        void handleFinalTranscript(text);
        return;
      }
      // No transcript — if agent active, restart listening (continuous loop).
      // Do NOT reset silence timer (avoids infinite 5s extension from recognizer restarts).
      if (agentActiveRef.current && gen === sessionGenRef.current) {
        if (
          sessionStateRef.current === 'listening' ||
          sessionStateRef.current === 'idle'
        ) {
          setTimeout(() => {
            if (
              gen === sessionGenRef.current &&
              agentActiveRef.current &&
              (sessionStateRef.current === 'listening' || sessionStateRef.current === 'idle')
            ) {
              enterListeningRef.current();
            }
          }, 250);
        }
      } else {
        setSessionState('idle');
      }
    };

    try {
      recognizer.start();
      if (agentActiveRef.current && !silenceTimerRef.current) {
        const phase = followUpSpokenRef.current ? 'second' : 'first';
        scheduleSilenceTimer(phase, gen);
      }
    } catch (err) {
      setSessionState('error');
      setError(err instanceof Error ? err.message : 'Could not start microphone');
      if (agentActiveRef.current) endAgentSessionRef.current();
    }
  }, [
    clearSilenceTimer,
    handleFinalTranscript,
    scheduleSilenceTimer,
    stopBargeVad,
    stopListening,
    t,
  ]);

  enterListeningRef.current = startListening;

  const endAgentSession = useCallback(
    (_opts?: { speakGoodbye?: boolean }) => {
      cancelSession();
    },
    [cancelSession],
  );
  endAgentSessionRef.current = endAgentSession;

  const startBargeInWatch = useCallback(
    async (gen: number) => {
      stopBargeVad();
      if (!agentActiveRef.current) return;
      const handle = await startPilotBargeInVad({
        rmsThreshold: VOICE_AGENT_CONFIG.bargeInRmsThreshold,
        holdMs: VOICE_AGENT_CONFIG.bargeInHoldMs,
        onSpeech: () => {
          if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
          if (sessionStateRef.current !== 'speaking') return;
          abortRef.current?.abort();
          abortRef.current = null;
          voiceAudioSession.stop();
          stopBargeVad();
          enterListeningRef.current();
        },
      });
      if (gen === sessionGenRef.current) {
        bargeVadRef.current = handle;
      } else {
        handle?.stop();
      }
    },
    [stopBargeVad],
  );

  // While agent is speaking, watch for barge-in (including opening greeting).
  useEffect(() => {
    if (!agentActive || sessionState !== 'speaking') {
      stopBargeVad();
      return;
    }
    const gen = sessionGenRef.current;
    void startBargeInWatch(gen);
    return () => {
      stopBargeVad();
    };
  }, [agentActive, sessionState, startBargeInWatch, stopBargeVad]);

  const startAgentSession = useCallback(async () => {
    if (activeProvider() === 'elevenlabs' && !settingsRef.current?.has_api_key) {
      setPrimaryTab('settings');
      setSettingsSection('provider');
      return;
    }
    if (!settingsRef.current?.selected_voice_id) {
      setPrimaryTab('voices');
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      setError('Speech recognition is not supported in this browser');
      setSessionState('error');
      return;
    }

    sessionGenRef.current += 1;
    const gen = sessionGenRef.current;
    agentActiveRef.current = true;
    setAgentActive(true);
    followUpSpokenRef.current = false;
    silencePhaseRef.current = 'none';
    turnHistoryRef.current = [];
    clearSilenceTimer();
    stopBargeVad();
    stopListening();
    stopAudio();
    setError(null);
    setInterimTranscript('');
    setLastTranscript('');
    setLastAnswer('');
    setSessionState('connecting');

    const probe = await probePilotMicrophone();
    if (gen !== sessionGenRef.current || !agentActiveRef.current) return;

    if (probe === 'not_found' || probe === 'unsupported') {
      setError(t('voicePilot.error.noMicrophone'));
      endAgentSessionRef.current();
      return;
    }
    if (probe === 'denied') {
      setError(t('voicePilot.error.micDenied'));
      endAgentSessionRef.current();
      return;
    }

    const opening = previewTextRef.current.trim() || DEFAULT_VOICE_PREVIEW_TEXT;
    await speakControlUtterance(opening, gen);
    if (gen !== sessionGenRef.current || !agentActiveRef.current) return;
    enterListeningRef.current();
  }, [
    clearSilenceTimer,
    speakControlUtterance,
    stopAudio,
    stopBargeVad,
    stopListening,
    t,
  ]);

  const onMicPress = useCallback(() => {
    if (agentActiveRef.current) {
      endAgentSession();
      return;
    }
    if (
      sessionState === 'connecting' ||
      sessionState === 'listening' ||
      sessionState === 'thinking' ||
      sessionState === 'speaking'
    ) {
      cancelSession();
      return;
    }
    void startAgentSession();
  }, [cancelSession, endAgentSession, sessionState, startAgentSession]);

  const setVoiceProvider = useCallback(
    async (next: VoicePilotProvider) => {
      if (!projectId) return;
      if (activeProvider() === next) return;
      cancelSession();
      stopPreviewAudio();
      voiceAudioSession.stop();
      setVoiceConfigMode(false);
      setConfigVoiceId(null);
      setDraftVoiceConfigState(VOICE_CONFIG_DEFAULTS);
      setError(null);
      try {
        await saveSettings({ voice_provider: next }, { toastOnSuccess: 'none' });
      } catch {
        /* error already surfaced */
      }
    },
    [cancelSession, projectId, saveSettings, stopPreviewAudio],
  );

  return {
    projectId,
    canUse,
    canSettings,
    voiceProvider,
    isCustomProvider,
    providerReady,
    setVoiceProvider,
    primaryTab,
    setPrimaryTab: setPrimaryTabSafe,
    settingsSection,
    setSettingsSection,
    settings,
    voices,
    workingVoices,
    trendingVoices,
    trendingIds,
    addToTrending,
    voiceCarouselIndex,
    setVoiceCarouselIndex,
    loading,
    saving,
    testingKey,
    error,
    setError,
    sessionState,
    lastTranscript,
    lastAnswer,
    interimTranscript,
    apiKeyDraft,
    setApiKeyDraft,
    localeDraft,
    setLocaleDraft,
    previewText,
    setPreviewText,
    previewBusy,
    playingVoiceId: audioSnap.voiceId,
    playbackPlaying: audioSnap.playing,
    playbackPaused: audioSnap.paused,
    playbackCurrentTime: audioSnap.currentTime,
    playbackDuration: audioSnap.duration,
    playbackVoiceName: audioSnap.voiceName,
    playbackSource,
    orbIntensity,
    orbSpectrum: liveOrbSpectrum,
    orbBands: liveOrbBands,
    orbVisualState,
    speechSupported: isSpeechRecognitionSupported(),
    reload,
    saveSettings,
    testKey,
    selectVoice,
    runPreview: () => runPreviewForVoice(null),
    runPreviewForVoice,
    toggleSamplePreview,
    speakTypedPreview,
    togglePlaybackBar,
    onMicPress,
    cancelSession,
    agentActive,
    endAgentSession,
    voiceConfigMode,
    configVoice,
    configVoiceId,
    configVoiceIndex,
    draftVoiceConfig,
    hasUnsavedVoiceConfig,
    applyingVoiceConfig,
    openVoiceConfiguration,
    closeVoiceConfiguration,
    setDraftVoiceConfig,
    resetDraftVoiceConfigToDefaults,
    applyVoiceConfiguration,
    appliedVoiceConfig,
    stopVoicePreview,
  };
}
