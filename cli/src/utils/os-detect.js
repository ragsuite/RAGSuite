'use strict';

function detectOs() {
  const platform = process.platform;
  let label = platform;
  if (platform === 'darwin') label = 'macOS';
  else if (platform === 'linux') label = 'Linux';
  else if (platform === 'win32') label = 'Windows';
  return { platform, label };
}

module.exports = { detectOs };
