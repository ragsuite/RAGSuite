#!/usr/bin/env node
/**
 * Fails if any static t('key') / labelKey / Error('errors.*') key is missing from en.ts.
 * Run: node scripts/check-i18n-keys.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EN_PATH = path.join(ROOT, 'src/i18n/locales/en.ts');

function parseLocaleKeys(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  const re = /"([^"\\]+)":/g;
  let match;
  while ((match = re.exec(text))) keys.add(match[1]);
  return keys;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'locales', '.git', 'dist'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const enKeys = parseLocaleKeys(EN_PATH);
const missing = new Map();

function add(key, source) {
  if (!key || enKeys.has(key)) return;
  if (!missing.has(key)) missing.set(key, new Set());
  missing.get(key).add(source);
}

const srcRoot = path.join(ROOT, 'src');
for (const file of walk(srcRoot)) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  for (const m of text.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) add(m[1], `${rel}:t()`);

  for (const m of text.matchAll(
    /\b(?:labelKey|titleKey|subtitleKey|noteKey|hintKey|descriptionKey|contentKey|actionKey|savingKey|saveKey)\s*[:=]\s*['"]([^'"]+)['"]/g,
  )) {
    add(m[1], `${rel}:prop`);
  }

  for (const m of text.matchAll(/(?:new Error|throw new Error)\(\s*['"]([a-z][a-zA-Z0-9_.-]+)['"]\s*\)/g)) {
    if (m[1].includes('.')) add(m[1], `${rel}:Error()`);
  }
}

// Dynamic families that must stay complete
const reasonKeys = [
  'helpful',
  'accurate',
  'complete',
  'clear',
  'fast_response',
  'incorrect',
  'hallucinated',
  'missing_sources',
  'too_technical',
  'outdated_information',
  'low_quality',
  'poor_formatting',
  'slow_response',
];
for (const reason of reasonKeys) {
  add(`chatbot.widget.feedback.reason.${reason}`, 'feedback-reason-keys');
}

for (const ns of ['chatbot', 'search']) {
  for (const suffix of [
    'domains.urlLabel',
    'domains.addUrl.a11y',
    'domains.urlPlaceholder',
    'domains.scopeLabel',
    'domains.scope.a11y',
    'domains.addUrl.subtitle',
    'domains.addButton.a11y',
    'domains.addButton',
    'domains.remove.a11y',
    'domains.validation.a11y',
    'domains.validation.title',
    'domains.scope.entireSite',
    'domains.scope.pageOnly',
    'domains.scope.pageAndSubpaths',
    'domains.validation.bullet1',
    'domains.validation.bullet2',
    'domains.validation.bullet3',
    'domains.validation.bullet4',
    'domains.validation.bullet5',
    'domains.validation.bullet6',
  ]) {
    add(`${ns}.${suffix}`, 'domainsNs');
  }
}

// Ignore known non-i18n false positives
const IGNORE = new Set(['label']);
for (const key of IGNORE) missing.delete(key);

const sorted = [...missing.keys()].sort();
if (sorted.length === 0) {
  console.log('i18n check passed: no missing keys in en.ts');
  process.exit(0);
}

console.error(`i18n check failed: ${sorted.length} missing key(s) in src/i18n/locales/en.ts\n`);
for (const key of sorted) {
  console.error(`  ${key}`);
  console.error(`    ${[...missing.get(key)].slice(0, 3).join(', ')}`);
}
process.exit(1);
