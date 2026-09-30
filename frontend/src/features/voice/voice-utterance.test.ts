import { shouldCommitVoiceUtterance } from './voice-utterance';

describe('shouldCommitVoiceUtterance', () => {
  it('commits when speech was heard and transcript is non-empty', () => {
    expect(
      shouldCommitVoiceUtterance({
        skipCommit: false,
        heardSpeech: true,
        transcript: 'What is T3Planet?',
      }),
    ).toBe(true);
  });

  it('does not commit empty or whitespace-only transcripts', () => {
    expect(
      shouldCommitVoiceUtterance({
        skipCommit: false,
        heardSpeech: true,
        transcript: '   ',
      }),
    ).toBe(false);
  });

  it('does not commit when no speech was heard', () => {
    expect(
      shouldCommitVoiceUtterance({
        skipCommit: false,
        heardSpeech: false,
        transcript: '',
      }),
    ).toBe(false);
  });

  it('does not commit after manual cancel or recognition error', () => {
    expect(
      shouldCommitVoiceUtterance({
        skipCommit: true,
        heardSpeech: true,
        transcript: 'hello',
      }),
    ).toBe(false);
  });
});
