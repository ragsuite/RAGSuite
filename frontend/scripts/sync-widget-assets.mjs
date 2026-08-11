#!/usr/bin/env node
/**
 * Copy widget bundles from backend static → frontend/public for TYPO3 / external embeds.
 * Run before `expo export` so nginx serves loader.js / widget.umd.js / widget.css
 * from the same host as ragsuite-init.js.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const BUNDLES = [
  {
    name: 'chatbot',
    sourceDir: join(repoRoot, 'backend/app/static/widget/v1'),
    targetDir: join(repoRoot, 'frontend/public/widget/v1'),
    files: ['loader.js', 'widget.umd.js', 'widget.css', 'widget.umd.js.map'],
  },
  {
    name: 'search',
    sourceDir: join(repoRoot, 'backend/app/static/search-widget/v1'),
    targetDir: join(repoRoot, 'frontend/public/search-widget/v1'),
    files: ['loader.js', 'search-widget.umd.js', 'search-widget.css', 'search-widget.umd.js.map'],
  },
];

for (const bundle of BUNDLES) {
  if (!existsSync(bundle.sourceDir)) {
    console.warn(`[sync-widget-assets] Skip ${bundle.name}: ${bundle.sourceDir} not found`);
    continue;
  }
  mkdirSync(bundle.targetDir, { recursive: true });
  for (const file of bundle.files) {
    const src = join(bundle.sourceDir, file);
    if (!existsSync(src)) {
      console.warn(`[sync-widget-assets] Skip missing ${bundle.name}/${file}`);
      continue;
    }
    copyFileSync(src, join(bundle.targetDir, file));
    console.log(`[sync-widget-assets] ${bundle.name}/${file}`);
  }
}
