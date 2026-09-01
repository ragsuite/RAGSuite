import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

import type { TrustDocument } from '@/features/trust-center/content/types';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';

const PRINT_CSS = `
@page { size: A4; margin: 18mm 16mm; }
html, body { margin: 0; padding: 0; width: 100%; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #111;
  background: #fff;
}
h1 { font-size: 22pt; margin: 0 0 8pt; line-height: 1.2; }
h2 { font-size: 14pt; margin: 18pt 0 8pt; line-height: 1.3; }
.meta, .footer { font-size: 9pt; color: #444; }
p { margin: 0 0 10pt; }
ul { margin: 0 0 10pt 18pt; padding: 0; }
li { margin-bottom: 4pt; }
hr { border: none; border-top: 1px solid #ccc; margin: 16pt 0; }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function documentFooter(productName: string): string {
  return `Generated from ${productName} Trust Center. Customise Controller placeholders before countersignature.`;
}

export function trustDocumentToMarkdown(
  doc: TrustDocument,
  productName = BRANDING_DEFAULTS.orgName,
): string {
  const lines: string[] = [
    `# ${doc.title}`,
    '',
    `**Product:** ${productName}`,
    `**Version:** ${doc.version}`,
    `**Updated:** ${doc.updatedAt}`,
    '',
    '---',
    '',
  ];

  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`, '');
    for (const paragraph of section.paragraphs) {
      lines.push(paragraph, '');
    }
    if (section.bullets?.length) {
      for (const bullet of section.bullets) {
        lines.push(`- ${bullet}`);
      }
      lines.push('');
    }
  }

  lines.push('---', '', `*${documentFooter(productName)}*`, '');
  return lines.join('\n');
}

export function trustDocumentToPlainText(
  doc: TrustDocument,
  productName = BRANDING_DEFAULTS.orgName,
): string {
  const lines: string[] = [
    doc.title,
    '',
    `Product: ${productName}`,
    `Version: ${doc.version}`,
    `Updated: ${doc.updatedAt}`,
    '',
    '---',
    '',
  ];

  for (const section of doc.sections) {
    lines.push(section.heading, '');
    for (const paragraph of section.paragraphs) {
      lines.push(paragraph, '');
    }
    if (section.bullets?.length) {
      for (const bullet of section.bullets) {
        lines.push(`- ${bullet}`);
      }
      lines.push('');
    }
  }

  lines.push('---', '', documentFooter(productName), '');
  return lines.join('\n');
}

export function trustDocumentToHtmlBody(
  doc: TrustDocument,
  productName = BRANDING_DEFAULTS.orgName,
): string {
  const parts: string[] = [
    `<h1>${escapeHtml(doc.title)}</h1>`,
    `<p class="meta">Product: ${escapeHtml(productName)} · Version ${escapeHtml(doc.version)} · Updated ${escapeHtml(doc.updatedAt)}</p>`,
    '<hr />',
  ];

  for (const section of doc.sections) {
    parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs) {
      parts.push(`<p>${escapeHtml(paragraph)}</p>`);
    }
    if (section.bullets?.length) {
      parts.push('<ul>');
      for (const bullet of section.bullets) {
        parts.push(`<li>${escapeHtml(bullet)}</li>`);
      }
      parts.push('</ul>');
    }
  }

  parts.push('<hr />', `<p class="footer">${escapeHtml(documentFooter(productName))}</p>`);
  return parts.join('\n');
}

export function trustDocumentToHtmlDocument(
  doc: TrustDocument,
  productName = BRANDING_DEFAULTS.orgName,
): string {
  const body = trustDocumentToHtmlBody(doc, productName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(doc.title)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function trustDocumentToDocxBuffer(
  doc: TrustDocument,
  productName = BRANDING_DEFAULTS.orgName,
): Promise<ArrayBuffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Product: ${productName} · Version ${doc.version} · Updated ${doc.updatedAt}`,
          size: 20,
          color: '444444',
        }),
      ],
    }),
    new Paragraph({ text: '' }),
  ];

  for (const section of doc.sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
    for (const paragraph of section.paragraphs) {
      children.push(new Paragraph({ children: [new TextRun({ text: paragraph })] }));
    }
    for (const bullet of section.bullets ?? []) {
      children.push(
        new Paragraph({
          text: bullet,
          bullet: { level: 0 },
        }),
      );
    }
  }

  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({
          text: documentFooter(productName),
          italics: true,
          size: 18,
          color: '444444',
        }),
      ],
    }),
  );

  const document = new Document({
    sections: [{ children }],
  });

  return Packer.toArrayBuffer(document);
}

export function printTrustDocumentHtml(htmlDocument: string, title: string): void {
  if (typeof document === 'undefined') {
    throw new Error('Print is only available on web');
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', title);
  // Browsers skip painting/printing iframe content at 0x0 — keep real layout box off-screen.
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
  frameDocument.write(htmlDocument);
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

  // Allow srcdoc/layout to settle before invoking the print dialog.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(triggerPrint, 100);
    });
  });
}

/** @deprecated Use printTrustDocumentHtml */
export function openTrustDocumentPrintWindow(htmlDocument: string, title: string): void {
  printTrustDocumentHtml(htmlDocument, title);
}
