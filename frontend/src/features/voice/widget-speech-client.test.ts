import { setNetworkActiveProjectId } from '@/network/active-project-id';

import {
  fetchWidgetSpeechConfig,
  resetWidgetSpeechConfigCache,
  subscribeWidgetSpeechConfigReset,
} from './widget-speech-client';

describe('widget-speech-client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetWidgetSpeechConfigCache();
    setNetworkActiveProjectId(null);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setNetworkActiveProjectId(null);
    resetWidgetSpeechConfigCache();
  });

  it('sends the dashboard project id on speech config', async () => {
    setNetworkActiveProjectId('proj-1');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { asr: { enabled: true }, tts: { enabled: true } } }),
    });

    const config = await fetchWidgetSpeechConfig('chat');
    expect(config).toEqual({ asr: true, tts: true });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain('surface=chat');
    expect(String(url)).toContain('project_id=proj-1');
    expect(init.headers['X-Project-ID']).toBe('proj-1');
  });

  it('resets cached native config when the active project changes', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { asr: { enabled: false }, tts: { enabled: false } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { asr: { enabled: true }, tts: { enabled: true } } }),
      });

    setNetworkActiveProjectId('proj-a');
    await expect(fetchWidgetSpeechConfig('search')).resolves.toEqual({ asr: false, tts: false });

    setNetworkActiveProjectId('proj-b');
    await expect(fetchWidgetSpeechConfig('search')).resolves.toEqual({ asr: true, tts: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('project_id=proj-b');
  });

  it('hits the network again after resetWidgetSpeechConfigCache', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { asr: { enabled: false }, tts: { enabled: false } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { asr: { enabled: true }, tts: { enabled: true } } }),
      });

    setNetworkActiveProjectId('proj-cache');
    await expect(fetchWidgetSpeechConfig('chat')).resolves.toEqual({ asr: false, tts: false });
    await expect(fetchWidgetSpeechConfig('chat')).resolves.toEqual({ asr: false, tts: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const notified = jest.fn();
    const unsubscribe = subscribeWidgetSpeechConfigReset(notified);
    resetWidgetSpeechConfigCache();
    expect(notified).toHaveBeenCalledTimes(1);
    unsubscribe();

    await expect(fetchWidgetSpeechConfig('chat')).resolves.toEqual({ asr: true, tts: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips a populated cache when fresh is true', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { asr: { enabled: false }, tts: { enabled: false } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { asr: { enabled: true }, tts: { enabled: true } } }),
      });

    setNetworkActiveProjectId('proj-fresh');
    await expect(fetchWidgetSpeechConfig('search')).resolves.toEqual({ asr: false, tts: false });
    await expect(fetchWidgetSpeechConfig('search', { fresh: true })).resolves.toEqual({
      asr: true,
      tts: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
