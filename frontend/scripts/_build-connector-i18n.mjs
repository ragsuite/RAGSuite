#!/usr/bin/env node
/**
 * One-shot builder: writes connector-locale-translations.mjs from EN keys + phrase maps.
 * Run: node scripts/_build-connector-i18n.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LANGS = ['hi', 'es', 'fr', 'de', 'ar', 'pt', 'zh', 'en-gb'];

function parseLocale(file) {
  const text = fs.readFileSync(file, 'utf8');
  const keys = {};
  const re = /"([^"]+)":\s*"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(text))) {
    keys[m[1]] = m[2]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return keys;
}

const en = parseLocale(path.join(ROOT, 'src/i18n/locales/en.ts'));
const prefixes = ['googleDrive.', 'notion.', 'confluence.', 'slack.', 'sharepoint.', 'teams.'];
const tabs = [
  'crawl.tabs.googleDrive',
  'crawl.tabs.notion',
  'crawl.tabs.confluence',
  'crawl.tabs.slack',
  'crawl.tabs.sharepoint',
  'crawl.tabs.teams',
];
const needed = [
  ...tabs,
  ...Object.keys(en).filter((k) => prefixes.some((p) => k.startsWith(p))),
].sort();

/** @type {Record<string, Record<string, string>>} */
const PHRASES = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '_connector-phrases.json'), 'utf8'),
);

const existingHi = parseLocale(path.join(ROOT, 'src/i18n/locales/hi.ts'));
const enToExisting = {};
for (const [k, v] of Object.entries(en)) {
  if (existingHi[k] && existingHi[k] !== v && !enToExisting[v]) {
    // Prefer explicit PHRASES; this is only a fallback seed check
    enToExisting[v] = true;
  }
}

const missing = [];
for (const val of new Set(needed.map((k) => en[k]))) {
  if (!PHRASES[val]) missing.push(val);
}
if (missing.length) {
  console.error(`Missing ${missing.length} English phrases in _connector-phrases.json:`);
  for (const v of missing) console.error(JSON.stringify(v));
  process.exit(1);
}

const CONNECTOR_TRANSLATIONS = Object.fromEntries(LANGS.map((l) => [l, {}]));
for (const key of needed) {
  const enVal = en[key];
  const row = PHRASES[enVal];
  for (const lang of LANGS) {
    const translated = row[lang];
    if (!translated) {
      console.error(`No ${lang} for`, JSON.stringify(enVal));
      process.exit(1);
    }
    if (translated !== enVal) {
      CONNECTOR_TRANSLATIONS[lang][key] = translated;
    }
  }
}

const outPath = path.join(import.meta.dirname, 'connector-locale-translations.mjs');
const lines = [
  '/**',
  ' * Connector panel + tab translations (Google Drive, Notion, Confluence, Slack, SharePoint, Teams).',
  ' * Source of truth for non-English overrides. Apply via: npm run sync-i18n',
  ' * Phrase map: scripts/_connector-phrases.json (rebuild with scripts/_build-connector-i18n.mjs)',
  ' */',
  'export const CONNECTOR_TRANSLATIONS = ' + JSON.stringify(CONNECTOR_TRANSLATIONS, null, 2) + ';',
  '',
];
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

for (const lang of LANGS) {
  console.log(`${lang}: ${Object.keys(CONNECTOR_TRANSLATIONS[lang]).length} overrides`);
}
console.log(`Wrote ${outPath}`);
