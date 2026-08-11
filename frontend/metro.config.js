const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../node_modules'),
  ...(config.resolver.nodeModulesPaths || []),
];

/** Phase 5: optional RAGSUITE_EE attach for Extension frontend packages. */
const eeRootEnv = (process.env.RAGSUITE_EE_ROOT || '').trim();
const eeRoot =
  eeRootEnv && fs.existsSync(eeRootEnv)
    ? path.resolve(eeRootEnv)
    : path.resolve(__dirname, 'src/platform/ee-stubs');

config.watchFolders = [...(config.watchFolders || []), eeRoot];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@ragsuite-ee': eeRoot,
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@ragsuite-ee/')) {
    const rel = moduleName.slice('@ragsuite-ee/'.length);
    const base = path.join(eeRoot, rel);
    for (const candidate of [
      base,
      `${base}.tsx`,
      `${base}.ts`,
      `${base}.js`,
      path.join(base, 'index.tsx'),
      path.join(base, 'index.ts'),
      path.join(base, 'index.js'),
    ]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { type: 'sourceFile', filePath: candidate };
      }
    }
  }

  // EE packages use the same `@/` alias as the Expo app.
  if (
    moduleName.startsWith('@/') &&
    context.originModulePath &&
    String(context.originModulePath).includes(`${path.sep}RAGSUITE_EE${path.sep}`)
  ) {
    const rel = moduleName.slice(2);
    const mapped = path.join(__dirname, 'src', rel);
    for (const candidate of [mapped, `${mapped}.tsx`, `${mapped}.ts`, path.join(mapped, 'index.tsx'), path.join(mapped, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { type: 'sourceFile', filePath: candidate };
      }
    }
  }

  if (platform !== 'web') {
    if (moduleName === 'isomorphic-dompurify' || moduleName === 'jsdom' || moduleName === 'pptx-preview') {
      return { type: 'empty' };
    }
  }

  if (platform === 'web') {
    if (moduleName === 'canvas') {
      return { type: 'empty' };
    }

    if (moduleName.endsWith('.wasm')) {
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, moduleName.replace(/^\//, '')),
      };
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
