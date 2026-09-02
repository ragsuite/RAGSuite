import { parseFeedbackEntriesPageResponse } from '@/features/feedback-moderation/utils/feedback-api';

const sampleRow = {
  id: '1',
  message_id: 'm1',
  user_message: 'hello',
  assistant_preview: 'world',
  feedback: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('parseFeedbackEntriesPageResponse', () => {
  it('parses paginated page objects', () => {
    const page = parseFeedbackEntriesPageResponse({
      items: [sampleRow],
      total: 42,
      limit: 25,
      offset: 0,
    });

    expect(page).not.toBeNull();
    expect(page?.total).toBe(42);
    expect(page?.limit).toBe(25);
    expect(page?.offset).toBe(0);
    expect(page?.items).toHaveLength(1);
  });

  it('still supports legacy array responses', () => {
    const page = parseFeedbackEntriesPageResponse([sampleRow]);
    expect(page?.items).toHaveLength(1);
    expect(page?.total).toBe(1);
  });
});
