/**
 * Lightweight mic RMS VAD for barge-in while the agent is speaking.
 * Not used for STT — Web Speech handles transcription after interrupt.
 */

export type PilotVadHandle = {
  stop: () => void;
};

type StartOpts = {
  rmsThreshold: number;
  holdMs: number;
  onSpeech: () => void;
};

export async function startPilotBargeInVad(opts: StartOpts): Promise<PilotVadHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let raf = 0;
  let aboveSince = 0;
  let fired = false;
  let stopped = false;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    ctx = new AC();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.55;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (stopped || fired) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();
      if (rms >= opts.rmsThreshold) {
        if (!aboveSince) aboveSince = now;
        if (now - aboveSince >= opts.holdMs) {
          fired = true;
          opts.onSpeech();
          return;
        }
      } else {
        aboveSince = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  } catch {
    stream?.getTracks().forEach((t) => t.stop());
    return null;
  }

  return {
    stop: () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      try {
        stream?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      stream = null;
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
