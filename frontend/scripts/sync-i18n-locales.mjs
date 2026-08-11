#!/usr/bin/env node
/**
 * Merges reference web frontend i18n with mobile locale overrides.
 * Output: locale files with `...en` spread + explicit translations per language.
 */
import fs from 'node:fs';
import path from 'node:path';

import { BRAND_VOICE_TRANSLATIONS } from './brand-voice-locale-overrides.mjs';
import { ERROR_TRANSLATIONS } from './error-locale-translations.mjs';
import { MOBILE_TRANSLATIONS } from './mobile-locale-translations.mjs';
import { UI_CONFIRM_TRANSLATIONS } from './ui-confirm-translations.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MOBILE_LOCALES = path.join(ROOT, 'src/i18n/locales');

const REF_LOCALE_CANDIDATES = [
  process.env.RAGSUITE_REF_I18N,
  path.resolve(ROOT, '../../Downloads/frontend/client/src/contexts/i18n'),
  '/Users/guru/Downloads/frontend/client/src/contexts/i18n',
].filter(Boolean);

function resolveRefLocalesDir() {
  for (const candidate of REF_LOCALE_CANDIDATES) {
    if (fs.existsSync(path.join(candidate, 'en.ts'))) return candidate;
  }
  return null;
}

const REF_LOCALES = resolveRefLocalesDir();

const LANGS = ['hi', 'es', 'fr', 'de', 'ar', 'pt', 'zh', 'en-gb'];

function parseLocaleFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const keys = {};
  const re = /"([^"]+)":\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = re.exec(text))) {
    keys[match[1]] = match[2]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return keys;
}

function escapeString(value) {
  return JSON.stringify(value);
}

function buildLocaleFile(lang, overrides) {
  const exportName = lang === 'en-gb' ? 'enGb' : lang;
  const lines = [
    `import { en } from './en';`,
    '',
    `export const ${exportName}: Record<string, string> = {`,
    '  ...en,',
  ];

  const sortedKeys = Object.keys(overrides).sort((a, b) => a.localeCompare(b));
  for (const key of sortedKeys) {
    lines.push(`  ${escapeString(key)}: ${escapeString(overrides[key])},`);
  }

  lines.push('};', '');
  return lines.join('\n');
}

function main() {
  const mobileEnPath = path.join(MOBILE_LOCALES, 'en.ts');
  const mobileEn = parseLocaleFile(mobileEnPath);
  const mobileEnKeys = Object.keys(mobileEn);

  const refEn = REF_LOCALES ? parseLocaleFile(path.join(REF_LOCALES, 'en.ts')) : {};
  if (REF_LOCALES) {
    console.log(`Reference i18n: ${REF_LOCALES}`);
  } else {
    console.warn('Reference i18n not found — skipping web frontend merge.');
  }

  for (const lang of LANGS) {
    const mobilePath = path.join(MOBILE_LOCALES, `${lang}.ts`);
    const refPath = REF_LOCALES ? path.join(REF_LOCALES, `${lang}.ts`) : null;
    const currentMobile = fs.existsSync(mobilePath) ? parseLocaleFile(mobilePath) : {};
    const refLang = refPath && fs.existsSync(refPath) ? parseLocaleFile(refPath) : {};

    const overrides = {};

    // Reverse map: reference English value -> reference key (for mobile-only key translation)
    const refEnValueToKey = {};
    for (const [key, value] of Object.entries(refEn)) {
      if (value && !refEnValueToKey[value]) refEnValueToKey[value] = key;
    }

    // Map: identical English text in reference -> translated value
    const refEnValueToTranslation = {};
    for (const [key, enValue] of Object.entries(refEn)) {
      const translated = refLang[key];
      if (enValue && translated && translated !== enValue && !refEnValueToTranslation[enValue]) {
        refEnValueToTranslation[enValue] = translated;
      }
    }

    for (const key of mobileEnKeys) {
      const enValue = mobileEn[key];
      let chosen = null;

      // 1) Keep mobile manual translation if it differs from English
      if (currentMobile[key] && currentMobile[key] !== enValue) {
        chosen = currentMobile[key];
      }
      // 2) Reference frontend translation (shared keys)
      else if (refLang[key] && refEn[key] && refLang[key] !== refEn[key]) {
        chosen = refLang[key];
      }
      // 3) Mobile-only key: match by identical English text in reference
      else if (!(key in refEn) && refEnValueToKey[enValue]) {
        const refKey = refEnValueToKey[enValue];
        if (refLang[refKey] && refLang[refKey] !== enValue) {
          chosen = refLang[refKey];
        }
      }
      // 3b) Any key: reuse reference translation for matching English text
      else if (refEnValueToTranslation[enValue]) {
        chosen = refEnValueToTranslation[enValue];
      }

      if (chosen != null && chosen !== enValue) {
        overrides[key] = chosen;
      }
    }

    // 4) Auto-generated mobile translations
    const mobileBundle = MOBILE_TRANSLATIONS[lang];
    if (mobileBundle) {
      for (const [key, value] of Object.entries(mobileBundle)) {
        if (key in mobileEn && value !== mobileEn[key]) {
          overrides[key] = value;
        }
      }
    }

    // 5) Curated confirm-dialog translations
    const confirmBundle = UI_CONFIRM_TRANSLATIONS[lang];
    if (confirmBundle) {
      for (const [key, value] of Object.entries(confirmBundle)) {
        if (key in mobileEn && value !== mobileEn[key]) {
          overrides[key] = value;
        }
      }
    }

    // 6) Curated service/error translations (highest priority for those keys)
    const errorBundle = ERROR_TRANSLATIONS[lang];
    if (errorBundle) {
      for (const [key, value] of Object.entries(errorBundle)) {
        if (key in mobileEn && value !== mobileEn[key]) {
          overrides[key] = value;
        }
      }
    }

    // 7) Brand-voice overrides (AGENTS.md §6 — highest priority)
    const brandVoiceBundle = BRAND_VOICE_TRANSLATIONS[lang];
    if (brandVoiceBundle) {
      for (const [key, value] of Object.entries(brandVoiceBundle)) {
        if (key in mobileEn && value !== mobileEn[key]) {
          overrides[key] = value;
        }
      }
    }

    const content = buildLocaleFile(lang, overrides);
    fs.writeFileSync(mobilePath, content, 'utf8');
    console.log(
      `${lang}: ${Object.keys(overrides).length} overrides written (${mobileEnKeys.length} en keys)`,
    );
  }
}

main();
