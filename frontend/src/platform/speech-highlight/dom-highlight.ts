const WORD_SPAN_CLASS = 'speech-word';
const ACTIVE_CLASS = 'speech-word-active';

function isSkippableNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName.toLowerCase();
  return tag === 'script' || tag === 'style' || tag === 'code' || tag === 'pre';
}

/** Wrap each visible word in the HTML body with indexed spans for TTS sync. */
export function prepareSpeechWordSpans(root: HTMLElement): number {
  let wordIndex = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE && !isSkippableNode(node)) {
      const value = node.textContent ?? '';
      if (value.trim()) textNodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const raw = textNode.textContent ?? '';
    const parts = raw.match(/(\s+|[^\s]+)/g);
    if (!parts?.length) continue;

    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      if (/^\s+$/.test(part)) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }
      const span = document.createElement('span');
      span.className = WORD_SPAN_CLASS;
      span.dataset.speechWordIndex = String(wordIndex);
      span.textContent = part;
      fragment.appendChild(span);
      wordIndex += 1;
    }
    textNode.replaceWith(fragment);
  }

  return wordIndex;
}

export function applySpeechWordHighlight(root: HTMLElement, activeWordIndex: number | null): void {
  const active = root.querySelector(`.${ACTIVE_CLASS}`);
  active?.classList.remove(ACTIVE_CLASS);

  if (activeWordIndex == null || activeWordIndex < 0) return;

  const next = root.querySelector(`[data-speech-word-index="${activeWordIndex}"]`);
  if (!(next instanceof HTMLElement)) return;
  next.classList.add(ACTIVE_CLASS);
  try {
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  } catch {
    /* ignore scroll failures in embedded iframes */
  }
}

export function clearSpeechWordSpans(root: HTMLElement): void {
  root.querySelectorAll(`.${WORD_SPAN_CLASS}`).forEach((span) => {
    if (!(span instanceof HTMLElement) || !span.parentNode) return;
    span.replaceWith(document.createTextNode(span.textContent ?? ''));
  });
  root.normalize();
}

export { ACTIVE_CLASS, WORD_SPAN_CLASS };
