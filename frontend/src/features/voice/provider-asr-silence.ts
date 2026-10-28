/** Native SpeechRecognition ends after a short pause; OpenAI ASR matches that. */
export const PROVIDER_ASR_SILENCE_MS = 1200;
export const PROVIDER_ASR_SPEECH_RMS = 0.04;
export const PROVIDER_ASR_POLL_MS = 80;

export function pcmRms(samples: Uint8Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centered = (samples[i] - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / samples.length);
}

export function silenceReached(opts: {
  heardSpeech: boolean;
  rms: number;
  speechRms: number;
  silentMs: number;
  silenceMs: number;
  pollMs: number;
}): { heardSpeech: boolean; silentMs: number; shouldStop: boolean } {
  const speakingNow = opts.rms >= opts.speechRms;
  const heardSpeech = opts.heardSpeech || speakingNow;
  if (!heardSpeech) {
    return { heardSpeech: false, silentMs: 0, shouldStop: false };
  }
  const silentMs = speakingNow ? 0 : opts.silentMs + opts.pollMs;
  return {
    heardSpeech: true,
    silentMs,
    shouldStop: silentMs >= opts.silenceMs,
  };
}

export type ProviderAsrSilenceHandle = {
  stop: () => void;
};

/**
 * Watch a live mic stream and fire once after speech followed by silence.
 * Uses the same MediaStream as MediaRecorder — not Voice Pilot VAD.
 */
export function watchProviderAsrSilence(
  stream: MediaStream,
  onSilenceAfterSpeech: () => void,
): ProviderAsrSilenceHandle {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtx) {
    return { stop: () => undefined };
  }
  let stopped = false;
  let heardSpeech = false;
  let silentMs = 0;
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const samples = new Uint8Array(512);

  try {
    ctx = new AudioCtx();
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
  } catch {
    return { stop: () => undefined };
  }

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
    try {
      source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      analyser?.disconnect();
    } catch {
      /* ignore */
    }
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => undefined);
    }
  };

  timer = setInterval(() => {
    if (stopped || !analyser) return;
    analyser.getByteTimeDomainData(samples);
    const next = silenceReached({
      heardSpeech,
      rms: pcmRms(samples),
      speechRms: PROVIDER_ASR_SPEECH_RMS,
      silentMs,
      silenceMs: PROVIDER_ASR_SILENCE_MS,
      pollMs: PROVIDER_ASR_POLL_MS,
    });
    heardSpeech = next.heardSpeech;
    silentMs = next.silentMs;
    if (next.shouldStop) {
      stop();
      onSilenceAfterSpeech();
    }
  }, PROVIDER_ASR_POLL_MS);

  return { stop };
}
