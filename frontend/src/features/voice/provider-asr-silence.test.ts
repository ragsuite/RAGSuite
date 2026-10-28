import {
  PROVIDER_ASR_POLL_MS,
  PROVIDER_ASR_SILENCE_MS,
  pcmRms,
  silenceReached,
} from './provider-asr-silence';

describe('provider ASR silence', () => {
  it('treats a flat 128 buffer as silence', () => {
    expect(pcmRms(new Uint8Array(8).fill(128))).toBe(0);
  });

  it('does not stop before speech is heard', () => {
    const next = silenceReached({
      heardSpeech: false,
      rms: 0,
      speechRms: 0.04,
      silentMs: 5000,
      silenceMs: PROVIDER_ASR_SILENCE_MS,
      pollMs: PROVIDER_ASR_POLL_MS,
    });
    expect(next.shouldStop).toBe(false);
    expect(next.heardSpeech).toBe(false);
  });

  it('auto-stops after speech followed by the silence window', () => {
    const afterSpeech = silenceReached({
      heardSpeech: false,
      rms: 0.5,
      speechRms: 0.04,
      silentMs: 0,
      silenceMs: PROVIDER_ASR_SILENCE_MS,
      pollMs: PROVIDER_ASR_POLL_MS,
    });
    expect(afterSpeech.heardSpeech).toBe(true);
    expect(afterSpeech.shouldStop).toBe(false);

    const afterSilence = silenceReached({
      heardSpeech: true,
      rms: 0,
      speechRms: 0.04,
      silentMs: PROVIDER_ASR_SILENCE_MS - PROVIDER_ASR_POLL_MS,
      silenceMs: PROVIDER_ASR_SILENCE_MS,
      pollMs: PROVIDER_ASR_POLL_MS,
    });
    expect(afterSilence.shouldStop).toBe(true);
  });

  it('resets the silence clock when speech resumes', () => {
    const next = silenceReached({
      heardSpeech: true,
      rms: 0.5,
      speechRms: 0.04,
      silentMs: 800,
      silenceMs: PROVIDER_ASR_SILENCE_MS,
      pollMs: PROVIDER_ASR_POLL_MS,
    });
    expect(next.silentMs).toBe(0);
    expect(next.shouldStop).toBe(false);
  });
});
