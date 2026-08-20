import { consumeSearchStream } from '@/features/search-config/utils/search-stream';

function sseResponse(lines: string[], ok = true): Response {
  const body = lines.map((line) => `${line}\n`).join('');
  return new Response(body, {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('consumeSearchStream', () => {
  it('returns final_answer from done event', async () => {
    const response = sseResponse([
      'data: {"token":"Hello "}',
      'data: {"token":"world"}',
      'data: {"done":true,"final_answer":"Hello world","sources":[],"message_id":"m1","session_id":"s1"}',
    ]);
    const result = await consumeSearchStream(response);
    expect(result.answer).toBe('Hello world');
    expect(result.message_id).toBe('m1');
  });

  it('falls back to accumulated tokens when final_answer is blank', async () => {
    const response = sseResponse([
      'data: {"token":"Partial answer"}',
      'data: {"done":true,"final_answer":"","sources":[]}',
    ]);
    const result = await consumeSearchStream(response);
    expect(result.answer).toBe('Partial answer');
  });

  it('returns empty answer when stream has no tokens', async () => {
    const response = sseResponse(['data: {"done":true,"final_answer":"","sources":[]}']);
    const result = await consumeSearchStream(response);
    expect(result.answer).toBe('');
  });

  it('maps og_image onto citation.image when image is missing', async () => {
    const sources: unknown[] = [];
    const response = sseResponse([
      'data: {"sources":[{"id":"s1","title":"Doc","url":"https://ex.com","og_image":"https://cdn.ex/og.jpg"}]}',
      'data: {"done":true,"final_answer":"ok","sources":[{"id":"s1","title":"Doc","url":"https://ex.com","og_image":"https://cdn.ex/og.jpg"}]}',
    ]);
    await consumeSearchStream(response, {
      onSources: (rows) => {
        sources.push(...rows);
      },
    });
    expect(sources[0]).toMatchObject({
      id: 's1',
      image: 'https://cdn.ex/og.jpg',
    });
  });
});
