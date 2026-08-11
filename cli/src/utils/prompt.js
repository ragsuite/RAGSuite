'use strict';

const readline = require('readline');

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(question, options = {}) {
  const { defaultValue = '', yesMode = false } = options;
  if (yesMode) {
    return Promise.resolve(defaultValue);
  }
  const rl = createInterface();
  const suffix = defaultValue !== '' && defaultValue != null ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      const trimmed = String(answer || '').trim();
      resolve(trimmed === '' ? defaultValue : trimmed);
    });
  });
}

async function confirm(question, options = {}) {
  const { defaultYes = false, yesMode = false } = options;
  if (yesMode) return defaultYes;
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(`${question} (${hint})`, { yesMode: false });
  if (!answer) return defaultYes;
  return /^(y|yes)$/i.test(answer);
}

async function choose(question, choices, options = {}) {
  const { defaultIndex = 0, yesMode = false } = options;
  if (yesMode) {
    return choices[defaultIndex];
  }
  console.log(question);
  choices.forEach((c, i) => {
    console.log(`  ${i + 1}) ${c.label}`);
  });
  const answer = await ask('Choice', {
    defaultValue: String(defaultIndex + 1),
    yesMode: false,
  });
  const n = Number(answer);
  if (!Number.isFinite(n) || n < 1 || n > choices.length) {
    return choices[defaultIndex];
  }
  return choices[n - 1];
}

module.exports = { ask, confirm, choose };
