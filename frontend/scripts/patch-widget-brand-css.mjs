#!/usr/bin/env node
/**
 * Post-process embed widget CSS bundles — align fonts/colors with RAGSuite brand tokens.
 * Canonical copies live under backend/app/static; run sync-widget-assets after this script.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const TARGETS = [
  join(repoRoot, 'backend/app/static/widget/v1/widget.css'),
  join(repoRoot, 'backend/app/static/search-widget/v1/search-widget.css'),
];

const REPLACEMENTS = [
  [/font-family:Inter/g, 'font-family:"Hanken Grotesk"'],
  [/font-family: Inter/g, 'font-family: "Hanken Grotesk"'],
  [/"Inter",/g, '"Hanken Grotesk",'],
  [/Inter,system-ui/g, '"Hanken Grotesk",system-ui'],
  [/Inter,-apple-system/g, '"Hanken Grotesk",-apple-system'],
  [/#0f172a/gi, '#1B1A17'],
  [/#1e293b/gi, '#1B1A17'],
  [/#334155/gi, '#57544C'],
  [/#64748b/gi, '#6E6A5C'],
  [/#94a3b8/gi, '#6E6A5C'],
  [/#f8fafc/gi, '#FBFAF6'],
  [/#f1f5f9/gi, '#F4F1EA'],
];

for (const filePath of TARGETS) {
  if (!existsSync(filePath)) {
    console.warn(`[patch-widget-brand-css] Skip missing ${filePath}`);
    continue;
  }
  let css = readFileSync(filePath, 'utf8');
  const before = css.length;
  for (const [pattern, replacement] of REPLACEMENTS) {
    css = css.replace(pattern, replacement);
  }
  writeFileSync(filePath, css, 'utf8');
  console.log(`[patch-widget-brand-css] Patched ${filePath} (${before} → ${css.length} bytes)`);
}
