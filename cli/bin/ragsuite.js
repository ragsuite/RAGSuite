#!/usr/bin/env node
'use strict';

const major = Number(String(process.versions.node).split('.')[0]);
if (!Number.isFinite(major) || major < 18) {
  console.error(
    `RAGSuite CLI requires Node.js 18 or newer. Current: ${process.version}`,
  );
  process.exit(1);
}

const { main } = require('../src/index.js');

main()
  .then((code) => {
    process.exit(typeof code === 'number' ? code : 0);
  })
  .catch((err) => {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  });
