import type { AiAssistantMessage } from '@/features/ai-assistant/types/ai-assistant.types';
import { downloadTextFile } from '@/shared/utils/download-text-file';
import {
  parseAssistantMarkdownBlocks,
  type AssistantMarkdownBlock,
} from '@/shared/utils/parse-assistant-markdown';
import { Platform } from 'react-native';

export type AiAssistantExportFormat = 'markdown' | 'json' | 'pdf';

function safeFilename(base: string, ext: string): string {
  const cleaned = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${cleaned || 'ai-assistant'}.${ext}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markdown → HTML (mirrors AssistantMarkdownBody rules). */
function inlineMarkdownToHtml(text: string): string {
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(pattern).filter((part) => part.length > 0);
  return parts
    .map((part) => {
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const safeHref = escapeHtml(href);
        return `<a href="${safeHref}">${escapeHtml(label)}</a>`;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (
        (part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length > 2)
      ) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }
      return escapeHtml(part);
    })
    .join('');
}

function blockToHtml(block: AssistantMarkdownBlock): string {
  switch (block.type) {
    case 'heading': {
      const tag = block.level === 2 ? 'h2' : 'h3';
      return `<${tag} style="font-size:${block.level === 2 ? '1.05' : '1'}rem;margin:.85rem 0 .35rem">${inlineMarkdownToHtml(block.text)}</${tag}>`;
    }
    case 'bullet':
      return `<li>${inlineMarkdownToHtml(block.text)}</li>`;
    case 'ordered':
      return `<li value="${block.index}">${inlineMarkdownToHtml(block.text)}</li>`;
    case 'blockquote':
      return `<blockquote style="margin:.5rem 0;padding-left:.75rem;border-left:3px solid #ccc;color:#444">${inlineMarkdownToHtml(block.text)}</blockquote>`;
    case 'code':
      return `<pre style="background:#f4f4f4;padding:.75rem;border-radius:6px;overflow:auto;font-size:.85rem"><code>${escapeHtml(block.text)}</code></pre>`;
    case 'table': {
      const head = block.headers
        .map((h) => `<th style="border:1px solid #ccc;padding:6px 8px;text-align:left;background:#f7f7f7">${inlineMarkdownToHtml(h)}</th>`)
        .join('');
      const rows = block.rows
        .map(
          (row) =>
            `<tr>${row
              .map(
                (cell) =>
                  `<td style="border:1px solid #ccc;padding:6px 8px">${inlineMarkdownToHtml(cell)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('');
      return `<table style="border-collapse:collapse;margin:.75rem 0;width:100%"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    case 'paragraph':
    default:
      return `<p style="margin:.4rem 0;line-height:1.5">${inlineMarkdownToHtml(block.text)}</p>`;
  }
}

function markdownContentToHtml(content: string): string {
  const blocks = parseAssistantMarkdownBlocks(content || '');
  if (blocks.length === 0) {
    return `<p style="margin:.4rem 0;line-height:1.5">${inlineMarkdownToHtml(content || '')}</p>`;
  }

  const parts: string[] = [];
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const tag = listBuffer.type;
    parts.push(
      `<${tag} style="margin:.4rem 0 .4rem 1.25rem;padding:0;line-height:1.5">${listBuffer.items.join('')}</${tag}>`,
    );
    listBuffer = null;
  };

  for (const block of blocks) {
    if (block.type === 'bullet') {
      if (listBuffer?.type !== 'ul') {
        flushList();
        listBuffer = { type: 'ul', items: [] };
      }
      listBuffer.items.push(blockToHtml(block));
      continue;
    }
    if (block.type === 'ordered') {
      if (listBuffer?.type !== 'ol') {
        flushList();
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(blockToHtml(block));
      continue;
    }
    flushList();
    parts.push(blockToHtml(block));
  }
  flushList();
  return parts.join('');
}

export function messagesToMarkdown(messages: AiAssistantMessage[], title?: string): string {
  const lines: string[] = [];
  if (title?.trim()) {
    lines.push(`# ${title.trim()}`, '');
  }
  for (const message of messages) {
    const role = message.role === 'user' ? 'User' : 'Assistant';
    lines.push(`## ${role}`, '', (message.content || '').trim(), '');
  }
  return lines.join('\n').trim() + '\n';
}

export function messagesToJson(messages: AiAssistantMessage[]): string {
  return `${JSON.stringify(
    messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content ?? '',
      created_at: m.created_at ?? null,
    })),
    null,
    2,
  )}\n`;
}

function messagesToPrintHtml(messages: AiAssistantMessage[], title?: string): string {
  const body = messages
    .map((m) => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const contentHtml = markdownContentToHtml(m.content || '');
      return `<section style="margin:0 0 1.25rem"><h2 style="font-size:1rem;margin:0 0 .35rem;font-family:system-ui,sans-serif">${escapeHtml(role)}</h2><div style="line-height:1.5">${contentHtml}</div></section>`;
    })
    .join('');
  const heading = title?.trim()
    ? `<h1 style="font-size:1.35rem;margin:0 0 1.5rem;font-family:system-ui,sans-serif">${escapeHtml(title.trim())}</h1>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title || 'AI Assistant')}</title><style>a{color:#0b57d0}code{background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:.9em}</style></head><body style="font-family:Georgia,serif;padding:24px;color:#111">${heading}${body}</body></html>`;
}

/** Trust Center–style print: hidden iframe + delayed print (avoids blank noopener windows). */
function printHtml(html: string, title: string): void {
  if (typeof document === 'undefined') {
    throw new Error('Print is only available on web');
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', title);
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '-10000px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument ?? frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    throw new Error('Unable to prepare PDF print preview');
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  frameDocument.title = title;

  const cleanup = () => {
    iframe.remove();
  };

  const triggerPrint = () => {
    frameWindow.focus();
    frameWindow.print();
    if ('onafterprint' in frameWindow) {
      frameWindow.addEventListener('afterprint', cleanup, { once: true });
    }
    window.setTimeout(cleanup, 2000);
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(triggerPrint, 100);
    });
  });
}

export async function exportAiAssistantMessages(
  messages: AiAssistantMessage[],
  format: AiAssistantExportFormat,
  opts?: { title?: string; filenameBase?: string },
): Promise<void> {
  const title = opts?.title ?? 'AI Assistant chat';
  const base = opts?.filenameBase ?? title;

  if (format === 'markdown') {
    const result = await downloadTextFile({
      content: messagesToMarkdown(messages, title),
      filename: safeFilename(base, 'md'),
      mimeType: 'text/markdown;charset=utf-8',
    });
    if (!result.success) throw new Error('Markdown export failed');
    return;
  }

  if (format === 'json') {
    const result = await downloadTextFile({
      content: messagesToJson(messages),
      filename: safeFilename(base, 'json'),
      mimeType: 'application/json;charset=utf-8',
    });
    if (!result.success) throw new Error('JSON export failed');
    return;
  }

  if (Platform.OS === 'web') {
    printHtml(messagesToPrintHtml(messages, title), title);
    return;
  }
  const result = await downloadTextFile({
    content: messagesToMarkdown(messages, title),
    filename: safeFilename(base, 'md'),
    mimeType: 'text/markdown;charset=utf-8',
  });
  if (!result.success) throw new Error('PDF export fallback failed');
}
