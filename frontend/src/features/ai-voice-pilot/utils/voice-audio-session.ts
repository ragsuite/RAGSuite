import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';

export type VoiceAudioSnapshot = {
  voiceId: string | null;
  voiceName: string | null;
  playing: boolean;
  paused: boolean;
  currentTime: number;
  duration: number;
};

export const SPECTRUM_BANDS = 12;

export type VoiceAudioBands = {
  bass: number;
  mid: number;
  high: number;
  rms: number;
  peak: number;
};

type Listener = (snapshot: VoiceAudioSnapshot) => void;
type IntensityListener = (intensity: number) => void;
type SpectrumListener = (spectrum: number[]) => void;
type BandsListener = (bands: VoiceAudioBands) => void;
type QueueIdleListener = () => void;

const idleSnapshot: VoiceAudioSnapshot = {
  voiceId: null,
  voiceName: null,
  playing: false,
  paused: false,
  currentTime: 0,
  duration: 0,
};

const idleSpectrum = (): number[] => Array.from({ length: SPECTRUM_BANDS }, () => 0);

const idleBands = (): VoiceAudioBands => ({
  bass: 0,
  mid: 0,
  high: 0,
  rms: 0,
  peak: 0,
});

type QueueItem = {
  blob: Blob;
  voiceId: string;
  voiceName: string;
};

function isAnalyserSafeSrc(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('blob:') || src.startsWith('data:')) return true;
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(src, window.location.href);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Web HTMLAudioElement session with pause/resume, sequential blob queue,
 * and optional AnalyserNode intensity/spectrum for voice orbs.
 *
 * Remote (cross-origin) URLs never use createMediaElementSource — that steals
 * default output and often yields silence for ElevenLabs CDN previews.
 */
export class VoiceAudioSession {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private listeners = new Set<Listener>();
  private intensityListeners = new Set<IntensityListener>();
  private spectrumListeners = new Set<SpectrumListener>();
  private bandsListeners = new Set<BandsListener>();
  private queueIdleListeners = new Set<QueueIdleListener>();
  private snapshot: VoiceAudioSnapshot = idleSnapshot;
  private raf: number | null = null;
  private intensityRaf: number | null = null;
  private queue: QueueItem[] = [];
  private draining = false;
  private queueGeneration = 0;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private boundAudioEl: HTMLAudioElement | null = null;
  private graphOwnsElement = false;
  private smoothIntensity = 0;
  private spectrum: number[] = idleSpectrum();
  private audioBands: VoiceAudioBands = idleBands();
  private prevRmsForPeak = 0;
  private peakHold = 0;
  private phaseFallbackStartedAt = 0;
  private motionSeed = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Subscribe to smoothed 0..1 intensity (~analyser / phase fallback). */
  subscribeIntensity(listener: IntensityListener): () => void {
    this.intensityListeners.add(listener);
    listener(this.smoothIntensity);
    return () => {
      this.intensityListeners.delete(listener);
    };
  }

  /** Subscribe to 0..1 spectrum bands for Siri-style orb bars. */
  subscribeSpectrum(listener: SpectrumListener): () => void {
    this.spectrumListeners.add(listener);
    listener(this.spectrum);
    return () => {
      this.spectrumListeners.delete(listener);
    };
  }

  /** Subscribe to lerped bass/mid/high/rms/peak for 3D orb shaders. */
  subscribeAudioBands(listener: BandsListener): () => void {
    this.bandsListeners.add(listener);
    listener(this.audioBands);
    return () => {
      this.bandsListeners.delete(listener);
    };
  }

  /**
   * Fires when playback queue is empty and nothing is playing.
   * Used by the Pilot agent loop to auto-enter LISTENING after TTS.
   */
  subscribeQueueIdle(listener: QueueIdleListener): () => void {
    this.queueIdleListeners.add(listener);
    return () => {
      this.queueIdleListeners.delete(listener);
    };
  }

  private notifyQueueIdle() {
    for (const listener of this.queueIdleListeners) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  }

  /** Resolves when not playing and queue is empty (or after timeoutMs). */
  waitUntilIdle(timeoutMs = 60000): Promise<void> {
    if (!this.snapshot.playing && !this.snapshot.paused && this.queue.length === 0 && !this.draining) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsub();
        resolve();
      };
      const unsub = this.subscribeQueueIdle(finish);
      const timer = setTimeout(finish, timeoutMs);
      const snap = this.getSnapshot();
      if (!snap.playing && !snap.paused && this.queue.length === 0 && !this.draining) {
        finish();
      }
    });
  }

  isBusy(): boolean {
    return this.snapshot.playing || this.snapshot.paused || this.queue.length > 0 || this.draining;
  }

  getSnapshot(): VoiceAudioSnapshot {
    return this.snapshot;
  }

  getIntensity(): number {
    return this.smoothIntensity;
  }

  getSpectrum(): number[] {
    return this.spectrum;
  }

  getAudioBands(): VoiceAudioBands {
    return this.audioBands;
  }

  private emit(partial: Partial<VoiceAudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
    if (this.snapshot.playing && !this.snapshot.paused) {
      this.ensureIntensityLoop();
    } else if (!this.snapshot.playing) {
      this.setIntensity(0);
      this.setSpectrum(idleSpectrum());
      this.setAudioBands(idleBands());
      this.stopIntensityRaf();
    }
  }

  private emitIntensity(value: number) {
    this.smoothIntensity = value;
    for (const listener of this.intensityListeners) {
      listener(value);
    }
  }

  private emitSpectrum(bands: number[]) {
    this.spectrum = bands;
    for (const listener of this.spectrumListeners) {
      listener(bands);
    }
  }

  private emitAudioBands(bands: VoiceAudioBands) {
    this.audioBands = bands;
    for (const listener of this.bandsListeners) {
      listener(bands);
    }
  }

  private setIntensity(target: number) {
    const next = this.smoothIntensity * 0.65 + target * 0.35;
    this.emitIntensity(Math.max(0, Math.min(1, next)));
  }

  private setSpectrum(bands: number[]) {
    const prev = this.spectrum;
    const smoothed = bands.map((v, i) => {
      const p = prev[i] ?? 0;
      return Math.max(0, Math.min(1, p * 0.55 + v * 0.45));
    });
    this.emitSpectrum(smoothed);
  }

  private setAudioBands(target: VoiceAudioBands) {
    const lerp = 0.22;
    const next: VoiceAudioBands = {
      bass: this.audioBands.bass * (1 - lerp) + target.bass * lerp,
      mid: this.audioBands.mid * (1 - lerp) + target.mid * lerp,
      high: this.audioBands.high * (1 - lerp) + target.high * lerp,
      rms: this.audioBands.rms * (1 - lerp) + target.rms * lerp,
      peak: Math.max(target.peak, this.audioBands.peak * 0.82),
    };
    this.emitAudioBands({
      bass: Math.max(0, Math.min(1, next.bass)),
      mid: Math.max(0, Math.min(1, next.mid)),
      high: Math.max(0, Math.min(1, next.high)),
      rms: Math.max(0, Math.min(1, next.rms)),
      peak: Math.max(0, Math.min(1, next.peak)),
    });
  }

  private disconnectGraph() {
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.mediaSource) {
      try {
        this.mediaSource.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.analyser = null;
    this.mediaSource = null;
    this.boundAudioEl = null;
    this.graphOwnsElement = false;
  }

  private async ensureAudioContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!this.audioContext) {
      this.audioContext = new AC();
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        /* ignore */
      }
    }
    return this.audioContext;
  }

  /**
   * Attach analyser only for blob/same-origin. Remote URLs keep default
   * HTMLAudioElement output so ElevenLabs CDN samples stay audible.
   */
  private ensureAudioGraph(audio: HTMLAudioElement, src: string) {
    if (!isAnalyserSafeSrc(src)) {
      // Do not steal remote element output.
      if (this.boundAudioEl && this.boundAudioEl !== audio) {
        this.disconnectGraph();
      }
      this.analyser = null;
      return;
    }

    const ctx = this.audioContext;
    if (!ctx) return;

    try {
      if (this.boundAudioEl === audio && this.analyser && this.mediaSource) {
        return;
      }
      this.disconnectGraph();

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      this.mediaSource = ctx.createMediaElementSource(audio);
      // Parallel: hear through destination + analyse.
      this.mediaSource.connect(this.analyser);
      this.mediaSource.connect(ctx.destination);
      this.boundAudioEl = audio;
      this.graphOwnsElement = true;
    } catch {
      // Never leave a stolen half-connected element — drop graph; element
      // may already be owned, so recreate path is handled by new Audio().
      this.disconnectGraph();
      this.analyser = null;
    }
  }

  private buildSyntheticSpectrum(t: number, intensityHint: number): number[] {
    const seed = this.motionSeed % 97;
    const bands: number[] = [];
    for (let i = 0; i < SPECTRUM_BANDS; i += 1) {
      const phase = seed * 0.17 + i * (0.55 + (seed % 5) * 0.08);
      const speed = 2.1 + (seed % 7) * 0.15 + i * 0.12;
      const wave =
        0.35 +
        0.35 * Math.sin(t * speed + phase) +
        0.2 * Math.sin(t * (speed * 1.7) + phase * 1.3) +
        0.15 * Math.sin(t * (3.4 + i * 0.4) + seed);
      const speechShape = 1 - Math.abs(i - SPECTRUM_BANDS / 2) / (SPECTRUM_BANDS / 2 + 0.5);
      bands.push(Math.max(0, Math.min(1, wave * (0.45 + intensityHint * 0.55) * (0.55 + speechShape * 0.45))));
    }
    return bands;
  }

  private readAnalyserSpectrum(): {
    intensity: number;
    bands: number[];
    audioBands: VoiceAudioBands;
  } | null {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) sum += data[i];
    const intensity = Math.min(1, (sum / (data.length * 255)) * 2.4);

    const bands: number[] = [];
    const binCount = data.length;
    const per = Math.max(1, Math.floor(binCount / SPECTRUM_BANDS));
    for (let b = 0; b < SPECTRUM_BANDS; b += 1) {
      let bandSum = 0;
      const start = b * per;
      const end = Math.min(binCount, start + per);
      for (let i = start; i < end; i += 1) bandSum += data[i];
      bands.push(Math.min(1, (bandSum / ((end - start) * 255)) * 2.2));
    }

    const avg = (from: number, to: number) => {
      let s = 0;
      const a = Math.max(0, Math.floor(from));
      const b = Math.min(binCount, Math.ceil(to));
      if (b <= a) return 0;
      for (let i = a; i < b; i += 1) s += data[i];
      return Math.min(1, (s / ((b - a) * 255)) * 2.2);
    };
    const bass = avg(0, binCount * 0.12);
    const mid = avg(binCount * 0.12, binCount * 0.45);
    const high = avg(binCount * 0.45, binCount);
    const rms = intensity;
    const jump = rms - this.prevRmsForPeak;
    this.prevRmsForPeak = rms;
    if (jump > 0.12) this.peakHold = Math.min(1, this.peakHold + jump * 1.8);
    else this.peakHold *= 0.9;

    return {
      intensity,
      bands,
      audioBands: { bass, mid, high, rms, peak: this.peakHold },
    };
  }

  private buildSyntheticAudioBands(t: number, intensityHint: number): VoiceAudioBands {
    const seed = this.motionSeed % 97;
    const bass = 0.25 + 0.35 * Math.sin(t * 1.7 + seed) + 0.15 * intensityHint;
    const mid = 0.3 + 0.4 * Math.sin(t * 2.6 + seed * 0.3) + 0.2 * intensityHint;
    const high = 0.2 + 0.35 * Math.sin(t * 4.1 + seed * 0.7) + 0.15 * intensityHint;
    const rms = intensityHint;
    const jump = rms - this.prevRmsForPeak;
    this.prevRmsForPeak = rms;
    if (jump > 0.08) this.peakHold = Math.min(1, this.peakHold + jump * 1.5);
    else this.peakHold *= 0.88;
    return {
      bass: Math.max(0, Math.min(1, bass)),
      mid: Math.max(0, Math.min(1, mid)),
      high: Math.max(0, Math.min(1, high)),
      rms: Math.max(0, Math.min(1, rms)),
      peak: this.peakHold,
    };
  }

  private ensureIntensityLoop() {
    if (this.intensityRaf != null) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    this.phaseFallbackStartedAt = performance.now();
    const tick = () => {
      if (!this.snapshot.playing || this.snapshot.paused) {
        this.intensityRaf = null;
        this.setIntensity(0);
        this.setSpectrum(idleSpectrum());
        this.setAudioBands(idleBands());
        return;
      }
      const analysed = this.readAnalyserSpectrum();
      if (analysed) {
        this.setIntensity(analysed.intensity);
        this.setSpectrum(analysed.bands);
        this.setAudioBands(analysed.audioBands);
      } else {
        const t = (performance.now() - this.phaseFallbackStartedAt) / 1000;
        const raw = 0.38 + 0.28 * Math.sin(t * Math.PI * 2.2 + (this.motionSeed % 10) * 0.2);
        this.setIntensity(raw);
        this.setSpectrum(this.buildSyntheticSpectrum(t, raw));
        this.setAudioBands(this.buildSyntheticAudioBands(t, raw));
      }
      this.intensityRaf = requestAnimationFrame(tick);
    };
    this.intensityRaf = requestAnimationFrame(tick);
  }

  private stopIntensityRaf() {
    if (this.intensityRaf != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.intensityRaf);
      this.intensityRaf = null;
    }
  }

  private clearObjectUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private stopRaf() {
    if (this.raf != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private startRaf() {
    this.stopRaf();
    if (typeof requestAnimationFrame === 'undefined') return;
    const tick = () => {
      if (!this.audio || this.snapshot.paused || !this.snapshot.playing) {
        this.raf = null;
        return;
      }
      this.emit({
        currentTime: this.audio.currentTime || 0,
        duration: Number.isFinite(this.audio.duration) ? this.audio.duration : this.snapshot.duration,
      });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private bindAudio(
    audio: HTMLAudioElement,
    src: string,
    voiceId: string,
    voiceName: string,
    onEnded: () => void,
  ) {
    this.motionSeed = hashSeed(voiceId);
    this.ensureAudioGraph(audio, src);
    audio.onended = () => {
      this.stopRaf();
      this.clearObjectUrl();
      this.audio = null;
      onEnded();
    };
    audio.onerror = () => {
      this.stopRaf();
      this.clearObjectUrl();
      this.audio = null;
      onEnded();
    };
    audio.onloadedmetadata = () => {
      this.emit({
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      });
    };
    this.emit({
      voiceId,
      voiceName,
      playing: true,
      paused: false,
      currentTime: 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    });
    this.startRaf();
    this.ensureIntensityLoop();
  }

  async playUrl(url: string, voice: Pick<VoicePilotVoice, 'voice_id' | 'name'>): Promise<void> {
    this.clearQueue();
    this.stopCurrent(false);
    if (typeof Audio === 'undefined') {
      throw new Error('Audio playback is not available on this device');
    }
    await this.ensureAudioContext();
    const audio = new Audio(url);
    this.audio = audio;
    // Remote CDN: never MediaElementSource — default element route stays audible.
    this.bindAudio(audio, url, voice.voice_id, voice.name, () => {
      this.emit({ ...idleSnapshot });
      this.notifyQueueIdle();
    });
    await audio.play();
  }

  async playBlob(blob: Blob, voice: Pick<VoicePilotVoice, 'voice_id' | 'name'>): Promise<void> {
    this.clearQueue();
    this.stopCurrent(false);
    if (typeof Audio === 'undefined') {
      throw new Error('Audio playback is not available on this device');
    }
    await this.ensureAudioContext();
    const url = URL.createObjectURL(blob);
    this.objectUrl = url;
    const audio = new Audio(url);
    this.audio = audio;
    this.bindAudio(audio, url, voice.voice_id, voice.name, () => {
      this.emit({ ...idleSnapshot });
      this.notifyQueueIdle();
    });
    await audio.play();
  }

  /** Enqueue a blob to play after the current item (Pilot sentence stream). */
  enqueueBlob(blob: Blob, voice: Pick<VoicePilotVoice, 'voice_id' | 'name'>): void {
    this.queue.push({ blob, voiceId: voice.voice_id, voiceName: voice.name });
    void this.drainQueue();
  }

  clearQueue(): void {
    this.queue = [];
    this.queueGeneration += 1;
  }

  private stopCurrent(emitIdle: boolean) {
    this.stopRaf();
    this.stopIntensityRaf();
    if (this.audio) {
      try {
        this.audio.onended = null;
        this.audio.onerror = null;
        this.audio.pause();
        this.audio.src = '';
      } catch {
        /* ignore */
      }
    }
    this.audio = null;
    // Drop graph ownership when destroying the element.
    if (this.graphOwnsElement) {
      this.disconnectGraph();
    }
    this.clearObjectUrl();
    if (emitIdle) {
      this.emit({ ...idleSnapshot });
      this.setIntensity(0);
      this.setSpectrum(idleSpectrum());
      this.setAudioBands(idleBands());
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    const gen = this.queueGeneration;
    try {
      while (this.queue.length > 0 && gen === this.queueGeneration) {
        const next = this.queue.shift();
        if (!next) break;
        if (typeof Audio === 'undefined') break;
        await this.ensureAudioContext();
        await new Promise<void>((resolve) => {
          if (gen !== this.queueGeneration) {
            resolve();
            return;
          }
          this.stopCurrent(false);
          const url = URL.createObjectURL(next.blob);
          this.objectUrl = url;
          const audio = new Audio(url);
          this.audio = audio;
          this.bindAudio(audio, url, next.voiceId, next.voiceName, () => resolve());
          void audio.play().catch(() => resolve());
        });
      }
      if (gen === this.queueGeneration && !this.audio) {
        this.emit({ ...idleSnapshot });
        this.setIntensity(0);
        this.setSpectrum(idleSpectrum());
        this.setAudioBands(idleBands());
        this.notifyQueueIdle();
      }
    } finally {
      this.draining = false;
      if (
        gen === this.queueGeneration &&
        !this.snapshot.playing &&
        this.queue.length === 0 &&
        !this.audio
      ) {
        this.notifyQueueIdle();
      }
    }
  }

  pause() {
    if (!this.audio || this.snapshot.paused) return;
    this.audio.pause();
    this.stopRaf();
    this.stopIntensityRaf();
    this.emit({
      playing: false,
      paused: true,
      currentTime: this.audio.currentTime || 0,
    });
    this.setIntensity(0);
    this.setSpectrum(idleSpectrum());
      this.setAudioBands(idleBands());
  }

  resume() {
    if (!this.audio || !this.snapshot.paused) return;
    void this.ensureAudioContext().then(() =>
      this.audio?.play().then(() => {
        this.emit({
          playing: true,
          paused: false,
          currentTime: this.audio?.currentTime || 0,
        });
        this.startRaf();
        this.ensureIntensityLoop();
      }),
    );
  }

  togglePause() {
    if (this.snapshot.paused) {
      this.resume();
    } else if (this.snapshot.playing) {
      this.pause();
    }
  }

  stop() {
    this.clearQueue();
    this.stopCurrent(true);
    this.notifyQueueIdle();
  }

  seek(seconds: number) {
    if (!this.audio) return;
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    const next = Math.max(0, Math.min(seconds, duration || seconds));
    this.audio.currentTime = next;
    this.emit({ currentTime: next, duration: duration || this.snapshot.duration });
  }
}

export const voiceAudioSession = new VoiceAudioSession();
