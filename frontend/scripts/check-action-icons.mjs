#!/usr/bin/env node
/**
 * Fails if banned Lucide action-icon variants appear under src/.
 * Canonical set: src/shared/constants/action-icons.ts
 *
 * Pure Node (no ripgrep) so CI runners work without extra apt packages.
 *
 * Usage: yarn check-action-icons
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');

/** Icon names that must not be used for shared actions (use ActionIcons instead). */
const BANNED = [
  // edit
  'SquarePen',
  'PenSquare',
  'PenLine',
  'PencilLine',
  'NotebookPen',
  'FilePen',
  'FileEdit',
  'Edit2',
  'Edit3',
  // delete
  'Trash',
  // add
  'PlusCircle',
  'CirclePlus',
  'PlusSquare',
  'SquarePlus',
  // upload / download
  'UploadCloud',
  'FileUp',
  'CloudUpload',
  'FileDown',
  'DownloadCloud',
  'CloudDownload',
  // settings / filter
  'Settings2',
  'ListFilter',
  'ListFilterPlus',
  // copy
  'ClipboardCopy',
  'ClipboardList',
  // refresh (RotateCcw is allowed for reset)
  'RefreshCcw',
  // more / close-as-action
  'MoreVertical',
  'Ellipsis',
  'EllipsisVertical',
  // help / globe / chart / success / docs
  'CircleHelp',
  'Globe2',
  'BarChart2',
  'BarChart3',
  'CheckCircle',
  'Book',
];

/** Files that may mention banned names only in comments / this allowlist. */
const ALLOW_PATH_SUBSTRINGS = [
  'src/shared/constants/action-icons.ts',
  'scripts/check-action-icons.mjs',
];

const BANNED_RE = new RegExp(`\\b(?:${BANNED.join('|')})\\b`);

function walkTsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, out);
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const files = walkTsFiles(srcRoot);
  const violations = [];

  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (ALLOW_PATH_SUBSTRINGS.some((p) => rel.includes(p))) {
      continue;
    }

    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!BANNED_RE.test(line)) continue;
      // ignore pure comment lines that only document the ban
      if (/^\s*\/\//.test(line) || /Prefer these over|never parallel|SquarePen/.test(line)) {
        continue;
      }
      violations.push(`${rel}:${i + 1}:${line}`);
    }
  }

  if (violations.length === 0) {
    console.log('check-action-icons: OK (no banned Lucide action variants)');
    return;
  }

  console.error('check-action-icons: banned Lucide variants found. Use ActionIcons / canonical names:\n');
  for (const line of violations) console.error(`  ${line}`);
  console.error('\nSee src/shared/constants/action-icons.ts');
  process.exit(1);
}

main();
