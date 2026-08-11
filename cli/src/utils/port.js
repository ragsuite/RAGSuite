'use strict';

const net = require('net');

function apiPort(env = process.env) {
  const n = Number(env.API_PORT || 9090);
  return Number.isFinite(n) && n > 0 ? n : 9090;
}

/**
 * Return true if something accepts TCP connections on host:port.
 */
function isPortInUse(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (inUse) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(inUse);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function assertApiPortFree(env = process.env) {
  const port = apiPort(env);
  const busy = await isPortInUse(port);
  if (busy) {
    const err = new Error(
      [
        `API port ${port} is already in use.`,
        'This CLI will not kill foreign processes.',
        '',
        'If a previous RAGSuite install is running:',
        '  ragsuite stop',
        '  # frees native PIDs + leftover Docker app containers (keeps DB volumes)',
        '',
        'See what owns the port:',
        `  lsof -nP -iTCP:${port} -sTCP:LISTEN`,
      ].join('\n'),
    );
    err.code = 'PORT_IN_USE';
    throw err;
  }
  return port;
}

/** @deprecated Prefer start-time API checks; init must not require free DB ports. */
const DEFAULT_INSTALL_PORTS = [
  { port: 9090, label: 'API' },
  { port: 9191, label: 'Expo web' },
];

async function assertPortsFree(ports = DEFAULT_INSTALL_PORTS) {
  const busy = [];
  for (const item of ports) {
    const p = typeof item === 'number' ? item : item.port;
    const label = typeof item === 'number' ? `port ${item}` : item.label;
    if (await isPortInUse(p)) {
      busy.push(`${label} :${p}`);
    }
  }
  if (busy.length) {
    const err = new Error(
      [
        `Port(s) already in use: ${busy.join(', ')}.`,
        'Run: ragsuite stop',
        'Then retry. Postgres/Redis being up is expected for native mode.',
      ].join('\n'),
    );
    err.code = 'PORT_IN_USE';
    throw err;
  }
}

module.exports = {
  apiPort,
  isPortInUse,
  assertApiPortFree,
  assertPortsFree,
  DEFAULT_INSTALL_PORTS,
};
