export type ChatEmbedHostViewport = {
  width: number;
  height: number;
};

/** Parent loader `viewport` postMessage — host page innerWidth/innerHeight, not the iframe. */
export function parseChatEmbedHostViewportMessage(data: unknown): ChatEmbedHostViewport | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== 'ragsuite-chatbot-host' || msg.type !== 'viewport') return null;
  const width = Number(msg.width);
  const height = Number(msg.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width: Math.round(width), height: Math.round(height) };
}
