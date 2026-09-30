import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clearSpeechHighlight,
  countSpeechWords,
  getSpeechHighlightState,
  setSpeechHighlightWord,
  startSpeechHighlightSession,
  updateSpeechHighlightWordCount,
} from '@/platform/speech-highlight';
import { setActiveVoiceOutput } from '../speech-session';
import {
  resolveVisibleWordOffset,
  shouldCancelUtteranceOnAppend,
  shouldClearHighlightOnQueueEmpty,
  shouldContinueHighlightSession,
} from '../tts-session';
import {
  buildSpeechSegments,
  buildSpokenToVisibleWordMap,
  estimateUtteranceDurationMs,
  fallbackLocalWordIndex,
  getSpeechPlainText,
  isSpeechSynthesisSupported,
  resolveVoiceProsody,
  selectProfessionalVoice,
  toSpeechLocale,
  waitForSpeechVoices,
  type SpeechSegment,
  clampFallbackWordAdvance,
} from '../web-speech';

type Options = {
  language?: string | null;
  enabled: boolean;
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

export function useTextToSpeech({ language, enabled }: Options) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const supported = enabled && isSpeechSynthesisSupported();
  const voiceProfileRef = useRef<VoiceProfile | null>(null);
  const queueRef = useRef<SpeechSegment[]>([]);
  const gapTimerRef = useRef<number | null>(null);
  const fallbackArmTimerRef = useRef<number | null>(null);
  const fallbackTickTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const spokenWordIndexRef = useRef(-1);
  const visibleHighlightRef = useRef(-1);
  const spokenToVisibleRef = useRef<number[]>([]);
  const activeContentKeyRef = useRef<string | null>(null);
  const suppressCancelErrorRef = useRef(false);
  const retainSessionRef = useRef(false);
  /** True after speak() queues audio until utterance.onstart (button stays idle). */
  const pendingStartRef = useRef(false);

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

  const setSpeakingSafe = useCallback((next: boolean) => {
    if (mountedRef.current) setSpeaking(next);
  }, []);

  const setPausedSafe = useCallback((next: boolean) => {
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
    clearGapTimer();
    clearFallbackTimers();
    queueRef.current = [];
    suppressCancelErrorRef.current = true;
    if (activeContentKeyRef.current) {
      clearSpeechHighlight(activeContentKeyRef.current);
      activeContentKeyRef.current = null;
    }
    spokenWordIndexRef.current = -1;
    visibleHighlightRef.current = -1;
    spokenToVisibleRef.current = [];
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
  }, [clearGapTimer, clearFallbackTimers, setSpeakingSafe, setPausedSafe]);

  /** End retainSession without canceling in-flight audio (stream finalize handoff). */
  const releaseSession = useCallback(() => {
    retainSessionRef.current = false;
    const synthesisBusy =
      typeof window !== 'undefined' &&
      Boolean(window.speechSynthesis?.speaking || window.speechSynthesis?.pending);
    if (synthesisBusy) {
      // Current utterance onend → finishIdle clears highlight (retainSession now false).
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
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.pause();
    } catch {
      /* ignore */
    }
    clearFallbackTimers();
    setPausedSafe(true);
  }, [clearFallbackTimers, setPausedSafe]);

  const resume = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
    setPausedSafe(false);
  }, [setPausedSafe]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
        const utteranceStartedAt = { current: 0 };

        const setVisibleBySpokenLocal = (localWordIndex: number) => {
          if (!mountedRef.current || activeContentKeyRef.current !== contentKey) return;
          if (segmentWordCount <= 0) return;
          const clampedLocal = Math.max(0, Math.min(localWordIndex, segmentWordCount - 1));
          const spokenGlobal = segmentBaseSpokenIndex + clampedLocal;
          if (spokenGlobal < spokenWordIndexRef.current) return;
          spokenWordIndexRef.current = spokenGlobal;

          const map = spokenToVisibleRef.current;
          const visible =
            map.length > 0
              ? (map[Math.min(spokenGlobal, map.length - 1)] ?? visibleHighlightRef.current)
              : spokenGlobal;
          if (visible < 0) return;
          if (visible <= visibleHighlightRef.current) return;
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
              // Keep timed sync running even after onboundary — sparse browser
              // boundaries otherwise leave the highlight frozen behind the voice.
              if (!mountedRef.current) {
                clearFallbackTimers();
                return;
              }
              if (activeContentKeyRef.current !== contentKey) {
                clearFallbackTimers();
                return;
              }
              if (window.speechSynthesis?.paused) return;
              const elapsed = Date.now() - utteranceStartedAt.current;
              const targetLocal = fallbackLocalWordIndex(elapsed, durationMs, segmentWordCount);
              const lastLocal = Math.max(
                -1,
                spokenWordIndexRef.current - segmentBaseSpokenIndex,
              );
              const local = clampFallbackWordAdvance(targetLocal, lastLocal);
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
          utteranceStartedAt.current = Date.now();
          setSpeakingSafe(true);
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
          setVisibleBySpokenLocal(localWordIndex);
        };

        utterance.onend = () => {
          if (!mountedRef.current) return;
          clearFallbackTimers();
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
      if (!supported || typeof window === 'undefined' || !window.speechSynthesis) return false;
      // Ignore a second speak while waiting for the first utterance to start.
      if (pendingStartRef.current) return false;
      const text = getSpeechPlainText(raw);
      const segments = buildSpeechSegments(text);
      if (!segments.length || !contentKey) return false;

      const synthesisSpeaking = Boolean(
        window.speechSynthesis.speaking || window.speechSynthesis.pending,
      );

      // Seed cursor from the shared store (survives hook remount / idle gaps).
      const existing = getSpeechHighlightState();
      if (existing?.contentKey === contentKey && existing.wordIndex >= 0) {
        visibleHighlightRef.current = Math.max(
          visibleHighlightRef.current,
          existing.wordIndex,
        );
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
        setSpeakingSafe(true);
        setPausedSafe(false);
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
        if (!mountedRef.current) return false;
        activeContentKeyRef.current = contentKey;
        spokenWordIndexRef.current = -1;
        visibleHighlightRef.current = -1;
        startSpeechHighlightSession(contentKey, fullVisibleCount);
      }
      if (!mountedRef.current) return false;
      activeContentKeyRef.current = contentKey;

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
      retainSessionRef.current = retainSession;
      queueRef.current = segments.slice(1);
      pendingStartRef.current = true;
      setActiveVoiceOutput(stop);
      setPausedSafe(false);
      speakSegment(segments[0], profile, contentKey);
      return true;
    },
    [
      language,
      setSpeakingSafe,
      setPausedSafe,
      speakSegment,
      stop,
      supported,
      clearGapTimer,
      clearFallbackTimers,
    ],
  );

  const toggle = useCallback(
    (raw: string, options: SpeakOptions) => {
      if (speaking && !paused) {
        pause();
        return;
      }
      if (speaking && paused) {
        resume();
        return;
      }
      void speak(raw, options);
    },
    [speak, speaking, paused, pause, resume],
  );

  return { supported, speaking, paused, toggle, speak, stop, releaseSession };
}
