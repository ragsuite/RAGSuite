import { Platform, Share } from 'react-native';

import type { TrustDocument } from '@/features/trust-center/content/types';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';

export function trustDocumentToMarkdown(doc: TrustDocument, productName = BRANDING_DEFAULTS.orgName): string {
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

  lines.push('---', '', `*Generated from ${productName} Trust Center. Customise Controller placeholders before countersignature.*`, '');
  return lines.join('\n');
}

export function trustExportFilename(doc: TrustDocument, locale: string): string {
  const safeTitle = doc.id.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  return `ragsuite-trust-center-${safeTitle}-${locale}.md`;
}

function downloadTextFileWeb(filename: string, contents: string, mime = 'text/markdown;charset=utf-8') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function exportTrustDocumentMarkdown(doc: TrustDocument, locale: string): Promise<void> {
  const markdown = trustDocumentToMarkdown(doc);
  const filename = trustExportFilename(doc, locale);

  if (Platform.OS === 'web') {
    downloadTextFileWeb(filename, markdown);
    return;
  }

  await Share.share({
    title: doc.title,
    message: markdown,
  });
}

/**
 * Web: trigger browser print so the user can save as PDF.
 * Native: fall back to Markdown share (no system print API in RN).
 */
export async function exportTrustDocumentPdf(doc: TrustDocument, locale: string): Promise<'printed' | 'shared'> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
    return 'printed';
  }
  await exportTrustDocumentMarkdown(doc, locale);
  return 'shared';
}
