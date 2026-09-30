import { Pause, Volume2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useWidgetCapabilities } from '@/platform/widget-capabilities';
import { countSpeechWords } from '@/platform/speech-highlight';
import type { VoiceOutputSlotProps } from '@/platform/extension-slots';

import { useTextToSpeech } from './hooks/useTextToSpeech';
import { findNextSpeakableChunk } from './speakable-chunk';
import { voiceCopy } from './strings';
import {
  isSpeechSynthesisBusy,
  remainingSpeakTextAfterStream,
  shouldDeferStreamingFinish,
  shouldReuseHighlightSession,
} from './tts-session';

import { armAutoSpeakForTurn, restorePendingAutoSpeak } from './voice-input-signal';
import { getSpeechPlainText, prefersReducedMotion } from './web-speech';

const IS_WEB = Platform.OS === 'web';
const STREAMING_CHUNK_INTERVAL_MS = 400;

export function VoiceOutputControl({
  contentKey,
  text,
  disabled = false,
  language,
  iconColor,
  activeColor,
  selectedIconColor: _selectedIconColor,
  tooltipBackground,
  tooltipBorder,
  tooltipColor,
  surface,
}: VoiceOutputSlotProps) {
  const { ready, hasTts } = useWidgetCapabilities();
  const copy = voiceCopy(language);
  const speakText = useMemo(() => {
    try {
      return getSpeechPlainText(text);
    } catch {
      return '';
    }
  }, [text]);
  // Keep the TTS engine enabled while streaming so auto-speak can call speak().
  // Manual button presses stay gated via Pressable disabled={disabled}.
  const ttsAvailable = ready && hasTts && Platform.OS === 'web';
  const { supported, speaking, paused, toggle, speak, releaseSession } = useTextToSpeech({
    language,
    enabled: ttsAvailable,
  });
  const pulse = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);

  const wasVoiceRef = useRef(false);
  const spokenLenRef = useRef(0);
  /** Plain prefix already committed for this turn (for polish-safe finish). */
  const spokenPrefixRef = useRef('');
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamHighlightStartedRef = useRef(false);
  const turnArmedRef = useRef(false);
  const spokeThisTurnRef = useRef(false);
  const finishedTurnRef = useRef(false);
  /** Stream ended while an utterance is still playing — finish after speech idles. */
  const pendingFinishRef = useRef(false);
  /** Prevent overlapping trySpeakNextChunk ticks from double-committing. */
  const chunkSpeakInFlightRef = useRef(false);
  const speakTextRef = useRef(speakText);
  speakTextRef.current = speakText;
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const releaseSessionRef = useRef(releaseSession);
  releaseSessionRef.current = releaseSession;
  const speakOptions = useMemo(() => ({ contentKey }), [contentKey]);
  const speakOptionsRef = useRef(speakOptions);
  speakOptionsRef.current = speakOptions;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const supportedRef = useRef(supported);
  supportedRef.current = supported;

  const clearStreamTimer = () => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  };

  const commitSpokenLen = (full: string, nextLen: number) => {
    spokenLenRef.current = nextLen;
    spokenPrefixRef.current = full.slice(0, nextLen);
  };

  const speakRemaining = async (append: boolean): Promise<boolean> => {
    const full = speakTextRef.current;
    const { remaining, diverged } = remainingSpeakTextAfterStream(full, spokenPrefixRef.current, {
      speechStarted: streamHighlightStartedRef.current,
    });
    if (diverged || !remaining) {
      commitSpokenLen(full, full.length);
      return true; // nothing left to speak
    }
    const visibleWordOffset = countSpeechWords(spokenPrefixRef.current);
    const accepted = await speakRef.current(remaining, {
      ...speakOptionsRef.current,
      append,
      retainSession: false,
      wordCount: countSpeechWords(full),
      visibleWordOffset,
    });
    if (!accepted) return false;
    commitSpokenLen(full, full.length);
    spokeThisTurnRef.current = true;
    streamHighlightStartedRef.current = true;
    return true;
  };

  const readSynthesisBusy = () =>
    typeof window !== 'undefined' && isSpeechSynthesisBusy(window.speechSynthesis);

  const finishStreamingSpeak = () => {
    clearStreamTimer();
    const synthesisBusy = readSynthesisBusy();

    // In-flight speech already tracks the highlighter. Defer finish — never
    // releaseSession / finishedTurn here (that clears highlight and drops the unread suffix).
    if (
      shouldDeferStreamingFinish({
        speechStarted: streamHighlightStartedRef.current,
        synthesisBusy,
        speaking: speakingRef.current,
      })
    ) {
      pendingFinishRef.current = true;
      return;
    }
    pendingFinishRef.current = false;

    // Even if React `speaking` flicked false early, never re-arm a full answer.
    const full = speakTextRef.current;
    const { remaining, diverged } = remainingSpeakTextAfterStream(full, spokenPrefixRef.current, {
      speechStarted: streamHighlightStartedRef.current,
    });
    if (streamHighlightStartedRef.current && (diverged || !remaining)) {
      commitSpokenLen(full, full.length);
      releaseSessionRef.current();
      wasVoiceRef.current = false;
      finishedTurnRef.current = true;
      turnArmedRef.current = false;
      return;
    }
    const reuseHighlight = shouldReuseHighlightSession({
      sameContentKey: true,
      highlightActive: streamHighlightStartedRef.current,
      synthesisSpeaking: synthesisBusy,
    });
    if (reuseHighlight && (diverged || !remaining)) {
      commitSpokenLen(full, full.length);
      releaseSessionRef.current();
      wasVoiceRef.current = false;
      finishedTurnRef.current = true;
      turnArmedRef.current = false;
      return;
    }
    if (remaining && !diverged) {
      // Continue the existing highlight session — never start a fresh one.
      void speakRemaining(true).then((accepted) => {
        if (!accepted) {
          // Engine still busy / dropped payload — retry when idle; do not lock the turn.
          pendingFinishRef.current = true;
          if (typeof window !== 'undefined') {
            window.setTimeout(() => {
              if (!pendingFinishRef.current || finishedTurnRef.current) return;
              if (speakingRef.current || readSynthesisBusy()) return;
              finishStreamingSpeak();
            }, 50);
          }
          return;
        }
        wasVoiceRef.current = false;
        finishedTurnRef.current = true;
        turnArmedRef.current = false;
      });
      return;
    }
    commitSpokenLen(full, full.length);
    wasVoiceRef.current = false;
    finishedTurnRef.current = true;
    turnArmedRef.current = false;
  };

  const trySpeakNextChunk = () => {
    if (!wasVoiceRef.current || finishedTurnRef.current) return;
    if (!supportedRef.current) return;
    // Avoid canceling in-flight speech — wait for the next tick.
    if (chunkSpeakInFlightRef.current || speakingRef.current || readSynthesisBusy()) return;
    const full = speakTextRef.current;
    const baseLen = spokenLenRef.current;
    const unspoken = full.slice(baseLen);
    const next = findNextSpeakableChunk(unspoken);
    if (!next) return;
    // Offset from committed prefix BEFORE this chunk — not (full - chunk).
    const visibleWordOffset = countSpeechWords(spokenPrefixRef.current);
    const append = streamHighlightStartedRef.current;
    chunkSpeakInFlightRef.current = true;
    void speakRef
      .current(next.chunk, {
        ...speakOptionsRef.current,
        append,
        retainSession: true,
        wordCount: countSpeechWords(full),
        visibleWordOffset,
      })
      .then((accepted) => {
        chunkSpeakInFlightRef.current = false;
        if (!accepted) return;
        // Only commit if no other path advanced the offset meanwhile.
        if (spokenLenRef.current !== baseLen) return;
        commitSpokenLen(full, baseLen + next.consumeLen);
        streamHighlightStartedRef.current = true;
        spokeThisTurnRef.current = true;
      })
      .catch(() => {
        chunkSpeakInFlightRef.current = false;
      });
  };

  // Arm once per user turn; keep wasVoice across contentKey remaps.
  useEffect(() => {
    const taken = armAutoSpeakForTurn(turnArmedRef.current);
    if (taken) {
      turnArmedRef.current = true;
      wasVoiceRef.current = taken.pending;
      commitSpokenLen(speakTextRef.current, taken.spokenLen);
      streamHighlightStartedRef.current = taken.spokenLen > 0;
      spokeThisTurnRef.current = taken.spokenLen > 0;
      finishedTurnRef.current = false;
      pendingFinishRef.current = false;
    }

    if (disabled || finishedTurnRef.current) {
      return;
    }

    if (!wasVoiceRef.current) {
      // Typed turn — nothing to auto-speak; allow a later voice turn to re-arm.
      turnArmedRef.current = false;
      return;
    }

    if (!speakText.trim()) {
      return;
    }

    // Idle / stream ended — never cancel mid-utterance; defer if still speaking.
    clearStreamTimer();
    if (speakingRef.current || readSynthesisBusy()) {
      pendingFinishRef.current = true;
      return;
    }
    finishStreamingSpeak();
  }, [disabled, contentKey, speakText]);

  // After stream end, speak remaining only once React speaking AND synthesis are idle.
  // Chrome can flick React `speaking` false while the engine is still busy.
  useEffect(() => {
    if (disabled || !pendingFinishRef.current) return;
    if (!wasVoiceRef.current || finishedTurnRef.current) {
      pendingFinishRef.current = false;
      return;
    }
    if (speaking || readSynthesisBusy()) {
      if (speaking) return;
      let cancelled = false;
      let attempts = 0;
      const poll = () => {
        if (cancelled || !pendingFinishRef.current || finishedTurnRef.current) return;
        if (speakingRef.current || readSynthesisBusy()) {
          attempts += 1;
          if (attempts < 120) {
            window.setTimeout(poll, 50);
          }
          return;
        }
        finishStreamingSpeak();
      };
      window.setTimeout(poll, 50);
      return () => {
        cancelled = true;
      };
    }
    finishStreamingSpeak();
  }, [speaking, disabled]);

  // Progressive chunk speaking during streaming.
  // Interval must NOT depend on speakText — token updates used to reset the timer
  // so mid-stream speak never fired until generation finished.
  useEffect(() => {
    if (!disabled || !ttsAvailable || !supported) {
      clearStreamTimer();
      return;
    }
    const tick = () => {
      if (!wasVoiceRef.current) return;
      trySpeakNextChunk();
    };
    tick();
    streamTimerRef.current = setInterval(tick, STREAMING_CHUNK_INTERVAL_MS);
    return () => {
      clearStreamTimer();
    };
  }, [disabled, ttsAvailable, supported]);

  // Opportunistic speak as soon as new text arrives (same refs, no timer reset).
  useEffect(() => {
    if (!disabled || !wasVoiceRef.current || !ttsAvailable || !supported) return;
    trySpeakNextChunk();
  }, [speakText, disabled, ttsAvailable, supported]);

  // Chat tears down the streaming row while still disabled — restore intent
  // (with spoken offset) so the final message can finish auto-speak.
  useEffect(() => {
    return () => {
      clearStreamTimer();
      if (!wasVoiceRef.current || finishedTurnRef.current) return;
      restorePendingAutoSpeak(spokenLenRef.current);
    };
  }, []);

  useEffect(() => {
    if (!speaking || prefersReducedMotion()) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    if (paused) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 380,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: !IS_WEB,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 380,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: !IS_WEB,
        }),
      ]),
    );
    loop.start();
    return () => {
      try {
        loop.stop();
        pulse.stopAnimation();
        pulse.setValue(1);
      } catch {
        /* ignore animation teardown races */
      }
    };
  }, [speaking, paused, pulse]);

  if (!ttsAvailable || !supported) return null;
  if (!speakText && !disabled) return null;

  const label = speaking
    ? paused
      ? copy.resumeSpeak
      : copy.pauseSpeak
    : copy.speak;
  const glyphColor = speaking ? activeColor : iconColor;
  const chat = surface === 'chat';
  const Icon = speaking && !paused ? Pause : Volume2;
  const showTooltip = IS_WEB && hovered && !disabled;
  const buttonDisabled = disabled || !speakText;

  return (
    <View style={styles.wrap}>
      {showTooltip ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.tooltip,
            chat ? styles.tooltipCenter : styles.tooltipStart,
            { backgroundColor: tooltipBackground, borderColor: tooltipBorder },
          ]}>
          <Text style={[styles.tooltipText, { color: tooltipColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: buttonDisabled, selected: speaking }}
        disabled={buttonDisabled}
        onPress={() => toggle(text, speakOptions)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        hitSlop={8}
        style={({ pressed }) => [
          chat ? styles.chatBtn : styles.searchBtn,
          {
            opacity: buttonDisabled ? 0.45 : 1,
            borderColor: speaking || hovered || pressed ? activeColor : 'transparent',
            backgroundColor:
              hovered || pressed ? tooltipBackground : 'transparent',
            ...(IS_WEB ? ({ zIndex: 2 } as object) : null),
          },
          IS_WEB
            ? ({
                cursor: buttonDisabled ? 'default' : 'pointer',
                transitionProperty: 'background-color, border-color, opacity',
                transitionDuration: '150ms',
              } as object)
            : null,
        ]}>
        <Animated.View pointerEvents="none" style={{ transform: [{ scale: pulse }] }}>
          <Icon size={chat ? 14 : 16} color={glyphColor} strokeWidth={1.5} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    flexShrink: 0,
    ...(IS_WEB ? ({ overflow: 'visible' as const, zIndex: 2 } as object) : null),
  },
  chatBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    zIndex: 30,
    ...(IS_WEB
      ? ({
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.12)',
        } as object)
      : null),
  },
  tooltipCenter: {
    left: '50%',
    ...(IS_WEB ? ({ transform: 'translateX(-50%)' } as object) : null),
  },
  tooltipStart: {
    left: 0,
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
