import { buildVoicePilotTurnStreamBody } from '@/features/ai-voice-pilot/services/voice-pilot.service';

describe('buildVoicePilotTurnStreamBody', () => {
  it('includes a non-null session_id for Voice Pilot history sessions', () => {
    const body = buildVoicePilotTurnStreamBody({
      text: 'What is RAGSuite?',
      sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(body.session_id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(body.session_id).not.toBeNull();
    expect(body.text).toBe('What is RAGSuite?');
  });

  it('does not invent chroma and blanks empty session ids', () => {
    const body = buildVoicePilotTurnStreamBody({ text: 'hello', sessionId: '  ' });
    expect(body.session_id).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/chroma/i);
  });
});
