import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clearSpeechHighlight,
  countSpeechWords,
  getSpeechHighlightState,
  setSpeechHighlightWord,
  startSpeechHighlightSession,
  updateSpeechHighlightWordCount,
} from '@/platform/speech-highlight';
import { cancelVoiceOutput, setActiveVoiceOutput } from '../speech-session';
import {
  isProviderTtsBusy,
  isProviderTtsPaused,
  pauseProviderTts,
  playProviderTts,
  resumeProviderTts,
  stopProviderTts,
} from '../provider-tts-player';
import {
  isTtsOutputLive,
  nextVoiceToggleAction,
  pausedTtsAction,
  resolveVisibleWordOffset,
  shouldCancelUtteranceOnAppend,
  shouldClearHighlightOnQueueEmpty,
  shouldContinueHighlightSession,
  shouldFallbackToNativeTts,
  shouldMarkSpeakingOnBusyBail,
} from '../tts-session';
import {
  NATIVE_RESUME_REPAIR_MS,
  createNativeWordClock,
  createPauseAwareElapsed,
  nativeResumeNeedsRepair,
  remainingSpeechFromWord,
  speechSynthesisElapsedMs,
  wordIndexFromCharProgress,
} from '../speech-highlight-clock';
import {
  fetchWidgetSpeechConfig,
  subscribeWidgetSpeechConfigReset,
  type WidgetSpeechSurface,
} from '../widget-speech-client';
import {
  buildSpeechSegments,
  buildSpokenToVisibleWordMap,
  estimateUtteranceDurationMs,
  getSpeechPlainText,
  isSpeechSynthesisSupported,
  resolveVoiceProsody,
  selectProfessionalVoice,
  toSpeechLocale,
  waitForSpeechVoices,
  type SpeechSegment,
} from '../web-speech';

type Options = {
  language?: string | null;
  enabled: boolean;
  surface?: WidgetSpeechSurface;
};

type SpeakOptions = {
  contentKey: string;
  /** Continue an existing highlight session (streaming voice chunks). */
  append?: boolean;
  /** Keep highlight/session alive when a chunk ends and more speech may follow. */
  retainSession?: boolean;
  /** Override visible word count (streaming grows the answer while speaking). */
  wordCount?: number;
  /** Absolute visible-word index where this chunk begins (from spoken prefix). */
  visibleWordOffset?: number;
};

type VoiceProfile = {
  lang: string;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume: number;
};

const FALLBACK_ARM_MS = 120;
const FALLBACK_TICK_MS = 50;

export function useTextToSpeech({ language, enabled, surface = 'chat' }: Options) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [proxyTts, setProxyTts] = useState(false);
  const nativeSupported = isSpeechSynthesisSupported();
  const supported = enabled && (proxyTts || nativeSupported);
  const usingProviderRef = useRef(false);
  const speakingRef = useRef(false);
  const pausedRef = useRef(false);
  const voiceProfileRef = useRef<VoiceProfile | null>(null);
  const queueRef = useRef<SpeechSegment[]>([]);
  const gapTimerRef = useRef<number | null>(null);
  const fallbackArmTimerRef = useRef<number | null>(null);
  const fallbackTickTimerRef = useRef<number | null>(null);
  const nativeRepairTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const spokenWordIndexRef = useRef(-1);
  const visibleHighlightRef = useRef(-1);
  const spokenToVisibleRef = useRef<number[]>([]);
  const activeContentKeyRef = useRef<string | null>(null);
  const suppressCancelErrorRef = useRef(false);
  const retainSessionRef = useRef(false);
  /** True after speak() queues audio until utterance.onstart (button stays idle). */
  const pendingStartRef = useRef(false);
  const nativeElapsedRef = useRef(createPauseAwareElapsed());
  const nativeClockRef = useRef(createNativeWordClock());
  const nativeUtteranceGenRef = useRef(0);
  const nativeActiveSegmentRef = useRef<SpeechSegment | null>(null);
  const nativeActiveProfileRef = useRef<VoiceProfile | null>(null);
  const nativeSegmentBaseRef = useRef(0);
  const speakSegmentRef = useRef<
    (segment: SpeechSegment, profile: VoiceProfile, contentKey: string) => void
  >(() => undefined);

  const clearGapTimer = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (gapTimerRef.current !== null) {
      window.clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  }, []);

  const clearFallbackTimers = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (fallbackArmTimerRef.current !== null) {
      window.clearTimeout(fallbackArmTimerRef.current);
      fallbackArmTimerRef.current = null;
    }
    if (fallbackTickTimerRef.current !== null) {
      window.clearInterval(fallbackTickTimerRef.current);
      fallbackTickTimerRef.current = null;
    }
  }, []);

  const clearNativeRepairTimer = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (nativeRepairTimerRef.current !== null) {
      window.clearTimeout(nativeRepairTimerRef.current);
      nativeRepairTimerRef.current = null;
    }
  }, []);

  const setSpeakingSafe = useCallback((next: boolean) => {
    speakingRef.current = next;
    if (mountedRef.current) setSpeaking(next);
  }, []);

  const setPausedSafe = useCallback((next: boolean) => {
    pausedRef.current = next;
    if (mountedRef.current) setPaused(next);
  }, []);

  const finishIdle = useCallback(
    (contentKey: string) => {
      pendingStartRef.current = false;
      if (!shouldClearHighlightOnQueueEmpty(retainSessionRef.current)) {
        setSpeakingSafe(false);
        setPausedSafe(false);
        return;
      }
      if (activeContentKeyRef.current === contentKey) {
        clearSpeechHighlight(contentKey);
        activeContentKeyRef.current = null;
      }
      setActiveVoiceOutput(null);
      setSpeakingSafe(false);
      setPausedSafe(false);
    },
    [setSpeakingSafe, setPausedSafe],
  );

  const stop = useCallback(() => {
    retainSessionRef.current = false;
    pendingStartRef.current = false;
    usingProviderRef.current = false;
    clearGapTimer();
    clearFallbackTimers();
    clearNativeRepairTimer();
    nativeActiveSegmentRef.current = null;
    nativeActiveProfileRef.current = null;
    queueRef.current = [];
    suppressCancelErrorRef.current = true;
    if (activeContentKeyRef.current) {
      clearSpeechHighlight(activeContentKeyRef.current);
      activeContentKeyRef.current = null;
    }
    spokenWordIndexRef.current = -1;
    visibleHighlightRef.current = -1;
    spokenToVisibleRef.current = [];
    stopProviderTts();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    setActiveVoiceOutput(null);
    setSpeakingSafe(false);
    setPausedSafe(false);
  }, [clearGapTimer, clearFallbackTimers, clearNativeRepairTimer, setSpeakingSafe, setPausedSafe]);

  /** End retainSession without canceling in-flight audio (stream finalize handoff). */
  const releaseSession = useCallback(() => {
    retainSessionRef.current = false;
    const outputLive = isTtsOutputLive(
      typeof window !== 'undefined' ? window.speechSynthesis : null,
      isProviderTtsBusy(),
      isProviderTtsPaused(),
    );
    if (outputLive) {
      // Keep stopTts while paused so mic barge-in can cancel the clip.
      return;
    }
    if (activeContentKeyRef.current) {
      clearSpeechHighlight(activeContentKeyRef.current);
      activeContentKeyRef.current = null;
    }
    setActiveVoiceOutput(null);
    setSpeakingSafe(false);
    setPausedSafe(false);
  }, [setSpeakingSafe, setPausedSafe]);

  const pause = useCallback(() => {
    clearNativeRepairTimer();
    if (usingProviderRef.current) {
      pauseProviderTts();
      setPausedSafe(true);
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.pause();
    } catch {
      /* ignore */
    }
    nativeElapsedRef.current.pause();
    setPausedSafe(true);
  }, [clearNativeRepairTimer, setPausedSafe]);

  const resumeNativeFromCurrentWord = useCallback(
    (contentKey: string) => {
      const segment = nativeActiveSegmentRef.current;
      const profile = nativeActiveProfileRef.current;
      if (!segment || !profile || typeof window === 'undefined' || !window.speechSynthesis) return;
      let local = nativeClockRef.current.lastBoundaryLocal();
      if (local < 0) {
        const durationMs = estimateUtteranceDurationMs(segment.text, profile.rate, profile.lang);
        local = wordIndexFromCharProgress(
          nativeElapsedRef.current.elapsedMs() / 1000,
          durationMs / 1000,
          segment.text,
        );
      }
      const remaining = remainingSpeechFromWord(segment.text, local);
      if (!remaining.trim()) return;
      const global = nativeSegmentBaseRef.current + local;
      const map = spokenToVisibleRef.current;
      const visible =
        map.length > 0
          ? (map[Math.min(Math.max(0, global), map.length - 1)] ?? visibleHighlightRef.current)
          : global;
      if (visible >= 0) {
        visibleHighlightRef.current = visible;
        setSpeechHighlightWord(contentKey, visible);
      }
      spokenWordIndexRef.current = global - 1;
      suppressCancelErrorRef.current = true;
      nativeUtteranceGenRef.current += 1;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      nativeElapsedRef.current = createPauseAwareElapsed();
      nativeClockRef.current = createNativeWordClock();
      nativeActiveSegmentRef.current = { text: remaining, pauseAfterMs: segment.pauseAfterMs };
      speakSegmentRef.current(nativeActiveSegmentRef.current, profile, contentKey);
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
      setPausedSafe(false);
    },
    [setPausedSafe],
  );

  const resume = useCallback(() => {
    if (usingProviderRef.current) {
      void resumeProviderTts().then((ok) => {
        if (ok) setPausedSafe(false);
      });
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    nativeElapsedRef.current.resume();
    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
    setPausedSafe(false);
    clearNativeRepairTimer();
    const contentKey = activeContentKeyRef.current;
    nativeRepairTimerRef.current = window.setTimeout(() => {
      nativeRepairTimerRef.current = null;
      if (!mountedRef.current || usingProviderRef.current) return;
      if (!nativeResumeNeedsRepair(window.speechSynthesis)) return;
      if (!contentKey) return;
      nativeElapsedRef.current.pause();
      resumeNativeFromCurrentWord(contentKey);
    }, NATIVE_RESUME_REPAIR_MS);
  }, [clearNativeRepairTimer, resumeNativeFromCurrentWord, setPausedSafe]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      void fetchWidgetSpeechConfig(surface, { fresh: true }).then((config) => {
        if (!cancelled && mountedRef.current) setProxyTts(config.tts);
      });
    };
    load();
    const unsubscribe = subscribeWidgetSpeechConfigReset(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, surface]);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      try {
        const voices = await waitForSpeechVoices(1500);
        if (cancelled || !mountedRef.current) return;
        const lang = toSpeechLocale(language);
        const prosody = resolveVoiceProsody(language);
        voiceProfileRef.current = {
          lang,
          voice: selectProfessionalVoice(lang, voices) as SpeechSynthesisVoice | null,
          rate: prosody.rate,
          pitch: prosody.pitch,
          volume: prosody.volume,
        };
      } catch {
        /* keep null profile; speak() fills defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [language, supported]);

  useEffect(
    () => () => {
      // Handoff (retainSession): leave synthesis running for the remounted control.
      if (retainSessionRef.current) return;
      stop();
    },
    [stop],
  );

  const speakSegment = useCallback(
    (segment: SpeechSegment, profile: VoiceProfile, contentKey: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis || !mountedRef.current) return;
      try {
        clearFallbackTimers();
        nativeUtteranceGenRef.current += 1;
        const utteranceGen = nativeUtteranceGenRef.current;
        nativeActiveSegmentRef.current = segment;
        nativeActiveProfileRef.current = profile;
        const utterance = new SpeechSynthesisUtterance(segment.text);
        utterance.lang = profile.lang;
        utterance.rate = profile.rate;
        utterance.pitch = profile.pitch;
        utterance.volume = profile.volume;
        if (profile.voice) utterance.voice = profile.voice;
        const segmentWordStarts = Array.from(segment.text.matchAll(/\S+/g))
          .map((m) => m.index ?? -1)
          .filter((n) => n >= 0);
        const segmentWordCount = segmentWordStarts.length;
        const segmentBaseSpokenIndex = spokenWordIndexRef.current + 1;
        nativeSegmentBaseRef.current = segmentBaseSpokenIndex;
        const nativeElapsed = createPauseAwareElapsed();
        const nativeClock = createNativeWordClock();
        nativeElapsedRef.current = nativeElapsed;
        nativeClockRef.current = nativeClock;

        const setVisibleBySpokenLocal = (localWordIndex: number, fromBoundary = false) => {
          if (!mountedRef.current || activeContentKeyRef.current !== contentKey) return;
          if (segmentWordCount <= 0) return;
          const clampedLocal = Math.max(0, Math.min(localWordIndex, segmentWordCount - 1));
          const spokenGlobal = segmentBaseSpokenIndex + clampedLocal;
          if (!fromBoundary && spokenGlobal < spokenWordIndexRef.current) return;
          spokenWordIndexRef.current = fromBoundary
            ? spokenGlobal
            : Math.max(spokenWordIndexRef.current, spokenGlobal);

          const map = spokenToVisibleRef.current;
          const visible =
            map.length > 0
              ? (map[Math.min(spokenGlobal, map.length - 1)] ?? visibleHighlightRef.current)
              : spokenGlobal;
          if (visible < 0) return;
          if (visible === visibleHighlightRef.current) return;
          if (!fromBoundary && visible < visibleHighlightRef.current) return;
          visibleHighlightRef.current = visible;
          setSpeechHighlightWord(contentKey, visible);
        };

        const armBoundaryAbsentFallback = () => {
          if (typeof window === 'undefined' || segmentWordCount <= 0) return;
          const durationMs = estimateUtteranceDurationMs(segment.text, profile.rate, profile.lang);
          fallbackArmTimerRef.current = window.setTimeout(() => {
            fallbackArmTimerRef.current = null;
            if (!mountedRef.current) return;
            if (activeContentKeyRef.current !== contentKey) return;
            fallbackTickTimerRef.current = window.setInterval(() => {
              if (!mountedRef.current) {
                clearFallbackTimers();
                return;
              }
              if (activeContentKeyRef.current !== contentKey) {
                clearFallbackTimers();
                return;
              }
              if (window.speechSynthesis?.paused || nativeElapsed.isPaused() || pausedRef.current) {
                return;
              }
              const elapsed = nativeElapsed.elapsedMs();
              const local = nativeClock.tickLocal(
                elapsed,
                durationMs,
                segmentWordCount,
                segment.text,
              );
              setVisibleBySpokenLocal(local);
            }, FALLBACK_TICK_MS);
          }, FALLBACK_ARM_MS);
        };

        const playNextOrIdle = () => {
          if (!mountedRef.current) return;
          const next = queueRef.current.shift();
          if (!next) {
            finishIdle(contentKey);
            return;
          }
          speakSegment(next, profile, contentKey);
        };

        utterance.onstart = () => {
          pendingStartRef.current = false;
          suppressCancelErrorRef.current = false;
          nativeElapsed.start();
          setSpeakingSafe(true);
          setPausedSafe(false);
          setVisibleBySpokenLocal(0);
          armBoundaryAbsentFallback();
        };

        utterance.onboundary = (event) => {
          if (!mountedRef.current || activeContentKeyRef.current !== contentKey) return;
          const boundaryChar = Number.isFinite(event.charIndex) ? event.charIndex : -1;
          const boundaryLen = Number.isFinite(event.charLength) ? event.charLength : 0;
          const namedWordBoundary = event.name === 'word';
          const boundarySlice =
            boundaryChar >= 0 && boundaryLen > 0
              ? segment.text.slice(boundaryChar, boundaryChar + boundaryLen)
              : '';
          const inferredWordBoundary =
            boundaryLen > 0 &&
            /\S/.test(boundarySlice) &&
            !/^[\s.,;:!?()[\]{}"'-]+$/.test(boundarySlice);
          if (!(namedWordBoundary || inferredWordBoundary)) return;
          if (boundaryChar < 0 || segmentWordCount === 0) return;
          let localWordIndex = 0;
          for (let i = 0; i < segmentWordStarts.length; i += 1) {
            if (segmentWordStarts[i] <= boundaryChar) localWordIndex = i;
            else break;
          }
          const elapsed = speechSynthesisElapsedMs(event.elapsedTime, nativeElapsed.elapsedMs());
          nativeClock.noteBoundary(localWordIndex, elapsed);
          setVisibleBySpokenLocal(localWordIndex, true);
        };

        utterance.onend = () => {
          if (!mountedRef.current) return;
          if (utteranceGen !== nativeUtteranceGenRef.current) return;
          clearFallbackTimers();
          if (segmentWordCount > 0) {
            setVisibleBySpokenLocal(segmentWordCount - 1, true);
          }
          if (!queueRef.current.length) {
            finishIdle(contentKey);
            return;
          }
          const pauseMs = Math.max(0, segment.pauseAfterMs);
          if (pauseMs === 0) {
            playNextOrIdle();
            return;
          }
          gapTimerRef.current = window.setTimeout(() => {
            gapTimerRef.current = null;
            playNextOrIdle();
          }, pauseMs);
        };

        utterance.onerror = () => {
          if (!mountedRef.current) return;
          if (utteranceGen !== nativeUtteranceGenRef.current) return;
          if (suppressCancelErrorRef.current) {
            suppressCancelErrorRef.current = false;
            return;
          }
          retainSessionRef.current = false;
          pendingStartRef.current = false;
          clearGapTimer();
          clearFallbackTimers();
          queueRef.current = [];
          if (activeContentKeyRef.current === contentKey) {
            clearSpeechHighlight(contentKey);
            activeContentKeyRef.current = null;
          }
          setActiveVoiceOutput(null);
          setSpeakingSafe(false);
          setPausedSafe(false);
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        retainSessionRef.current = false;
        pendingStartRef.current = false;
        clearFallbackTimers();
        if (activeContentKeyRef.current === contentKey) {
          clearSpeechHighlight(contentKey);
          activeContentKeyRef.current = null;
        }
        setActiveVoiceOutput(null);
        setSpeakingSafe(false);
        setPausedSafe(false);
      }
    },
    [clearFallbackTimers, clearGapTimer, finishIdle, setSpeakingSafe, setPausedSafe],
  );
  speakSegmentRef.current = speakSegment;

  const speak = useCallback(
    async (
      raw: string,
      {
        contentKey,
        append = false,
        retainSession = false,
        wordCount,
        visibleWordOffset,
      }: SpeakOptions,
    ): Promise<boolean> => {
      if (!enabled || typeof window === 'undefined') return false;
      const speechConfig = await fetchWidgetSpeechConfig(surface, { fresh: true });
      const useProvider = speechConfig.tts;
      usingProviderRef.current = useProvider;
      if (!useProvider && !window.speechSynthesis) return false;
      // Ignore a second speak while waiting for the first utterance to start.
      if (pendingStartRef.current) return false;
      const text = getSpeechPlainText(raw);
      const nativeSegments = buildSpeechSegments(text);
      const segments = useProvider ? [{ text, pauseAfterMs: 0 }] : nativeSegments;
      if (!segments.length || !contentKey) return false;

      const synthesisSpeaking = useProvider
        ? isProviderTtsBusy()
        : Boolean(window.speechSynthesis?.speaking || window.speechSynthesis?.pending);

      // Seed cursor from the shared store (survives hook remount / idle gaps).
      const existing = getSpeechHighlightState();
      if (existing?.contentKey === contentKey && existing.wordIndex >= 0) {
        visibleHighlightRef.current = Math.max(
          visibleHighlightRef.current,
          existing.wordIndex,
        );
      }

      const enginePaused = useProvider
        ? isProviderTtsPaused()
        : Boolean(window.speechSynthesis?.paused || pausedRef.current);
      const pausedAction = pausedTtsAction({
        paused: enginePaused,
        activeContentKey:
          activeContentKeyRef.current ?? getSpeechHighlightState()?.contentKey ?? null,
        requestedContentKey: contentKey,
      });
      if (pausedAction === 'resume') {
        if (useProvider) {
          const ok = await resumeProviderTts();
          if (ok) {
            setSpeakingSafe(true);
            setPausedSafe(false);
            setActiveVoiceOutput(stop);
            return true;
          }
        } else {
          resume();
          return true;
        }
      }
      if (pausedAction === 'replace') {
        cancelVoiceOutput();
        stop();
        usingProviderRef.current = useProvider;
      }

      // Live audio must never be canceled/restarted — that paints highlight at word 0
      // while the previous utterance can keep playing (Chrome ghost audio).
      // Do not downgrade retainSession or claim the text was accepted.
      if (synthesisSpeaking) {
        if (retainSession) {
          retainSessionRef.current = true;
        }
        activeContentKeyRef.current = contentKey;
        if (wordCount != null && wordCount > 0) {
          updateSpeechHighlightWordCount(contentKey, wordCount);
        }
        if (shouldMarkSpeakingOnBusyBail(synthesisSpeaking)) {
          setSpeakingSafe(true);
        }
        setActiveVoiceOutput(stop);
        return false;
      }

      // Defer retainSession / map updates until we know this speak() will proceed.
      if (append && activeContentKeyRef.current === contentKey) {
        if (shouldCancelUtteranceOnAppend(synthesisSpeaking)) {
          return false;
        }
      }

      const reuseHighlight = shouldContinueHighlightSession({
        append,
        storeActiveForKey: Boolean(
          existing?.contentKey === contentKey && existing.wordIndex >= 0,
        ),
        sameContentKey: activeContentKeyRef.current === contentKey,
        highlightActive: visibleHighlightRef.current >= 0,
        synthesisSpeaking,
      });

      const alignment = buildSpokenToVisibleWordMap(text);
      const chunkVisibleCount = alignment.visibleWordCount || countSpeechWords(text);
      const fullVisibleCount = Math.max(wordCount ?? chunkVisibleCount, chunkVisibleCount);
      const visibleOffset = resolveVisibleWordOffset({
        explicit: visibleWordOffset,
        highlightIndex: visibleHighlightRef.current,
      });
      spokenToVisibleRef.current = alignment.spokenToVisible.map((index) => index + visibleOffset);

      if (reuseHighlight) {
        clearGapTimer();
        clearFallbackTimers();
        queueRef.current = [];
        spokenWordIndexRef.current = -1;
        // Keep visibleHighlightRef so onstart(0) cannot paint word 0 over the live cursor.
        const live = getSpeechHighlightState();
        if (live?.contentKey === contentKey) {
          updateSpeechHighlightWordCount(contentKey, fullVisibleCount);
        } else {
          const keep = visibleHighlightRef.current;
          startSpeechHighlightSession(contentKey, fullVisibleCount);
          if (keep >= 0) {
            setSpeechHighlightWord(contentKey, keep);
            visibleHighlightRef.current = keep;
          }
        }
      } else {
        stop();
        usingProviderRef.current = useProvider;
        if (!mountedRef.current) return false;
        activeContentKeyRef.current = contentKey;
        spokenWordIndexRef.current = -1;
        visibleHighlightRef.current = -1;
        startSpeechHighlightSession(contentKey, fullVisibleCount);
      }
      if (!mountedRef.current) return false;
      activeContentKeyRef.current = contentKey;

      if (useProvider) {
        const applySpokenLocal = (localWordIndex: number) => {
          if (!mountedRef.current || activeContentKeyRef.current !== contentKey) return;
          const map = spokenToVisibleRef.current;
          const spokenGlobal = Math.max(0, localWordIndex);
          spokenWordIndexRef.current = spokenGlobal;
          const visible =
            map.length > 0
              ? (map[Math.min(spokenGlobal, map.length - 1)] ?? visibleHighlightRef.current)
              : spokenGlobal;
          if (visible < 0) return;
          if (visible === visibleHighlightRef.current) return;
          visibleHighlightRef.current = visible;
          setSpeechHighlightWord(contentKey, visible);
        };
        retainSessionRef.current = retainSession;
        pendingStartRef.current = true;
        setActiveVoiceOutput(stop);
        setPausedSafe(false);
        const accepted = await playProviderTts({
          text,
          surface,
          language,
          onStart: () => {
            pendingStartRef.current = false;
            setSpeakingSafe(true);
          },
          onWord: (local) => applySpokenLocal(local),
          onEnd: () => finishIdle(contentKey),
          onError: () => {
            pendingStartRef.current = false;
            usingProviderRef.current = false;
            if (!speakingRef.current) {
              return;
            }
            retainSessionRef.current = false;
            if (activeContentKeyRef.current === contentKey) {
              clearSpeechHighlight(contentKey);
              activeContentKeyRef.current = null;
            }
            setActiveVoiceOutput(null);
            setSpeakingSafe(false);
            setPausedSafe(false);
          },
        });
        if (accepted) return true;
        pendingStartRef.current = false;
        usingProviderRef.current = false;
        if (activeContentKeyRef.current === contentKey) {
          clearSpeechHighlight(contentKey);
          activeContentKeyRef.current = null;
        }
        setActiveVoiceOutput(null);
        setSpeakingSafe(false);
        if (!shouldFallbackToNativeTts(useProvider)) {
          return false;
        }
      }

      let profile = voiceProfileRef.current;
      const lang = toSpeechLocale(language);
      if (!profile || profile.lang !== lang || !profile.voice) {
        try {
          const voices = await waitForSpeechVoices(1500);
          if (!mountedRef.current) return false;
          const prosody = resolveVoiceProsody(language);
          profile = {
            lang,
            voice: selectProfessionalVoice(lang, voices) as SpeechSynthesisVoice | null,
            rate: prosody.rate,
            pitch: prosody.pitch,
            volume: prosody.volume,
          };
          voiceProfileRef.current = profile;
        } catch {
          const prosody = resolveVoiceProsody(language);
          profile = {
            lang,
            voice: null,
            rate: prosody.rate,
            pitch: prosody.pitch,
            volume: prosody.volume,
          };
          voiceProfileRef.current = profile;
        }
      }

      // Re-check after async voice load — engine may have become busy.
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        if (retainSession) {
          retainSessionRef.current = true;
        }
        return false;
      }

      // Apply retainSession only once audio is actually queued.
      // Button active state waits for utterance.onstart (highlight session is already armed).
      const firstNative = nativeSegments[0];
      if (!firstNative) {
        pendingStartRef.current = false;
        return false;
      }
      retainSessionRef.current = retainSession;
      queueRef.current = nativeSegments.slice(1);
      pendingStartRef.current = true;
      setActiveVoiceOutput(stop);
      setPausedSafe(false);
      speakSegment(firstNative, profile, contentKey);
      return true;
    },
    [
      language,
      surface,
      enabled,
      setSpeakingSafe,
      setPausedSafe,
      speakSegment,
      stop,
      finishIdle,
      resume,
      clearGapTimer,
      clearFallbackTimers,
    ],
  );

  const toggle = useCallback(
    (raw: string, options: SpeakOptions) => {
      const action = nextVoiceToggleAction(speakingRef.current, pausedRef.current);
      if (action === 'pause') {
        pause();
        return;
      }
      if (action === 'resume') {
        resume();
        return;
      }
      void speak(raw, options);
    },
    [speak, pause, resume],
  );

  return { supported, speaking, paused, toggle, speak, stop, releaseSession };
}
