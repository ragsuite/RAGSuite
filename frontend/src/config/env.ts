import envFile from '../../env.json';

type EnvFile = {
  API_URL: string;
  IS_DEBUG?: boolean;
  WIDGET_ASSET_BASE?: string;
};

const typedEnv = envFile as EnvFile;

export const env = {
  appName: 'RAGSuite',
  apiBaseUrl: typedEnv.API_URL,
  isDebug: Boolean(typedEnv.IS_DEBUG),
  /**
   * Public origin that serves `/widget/v1/ragsuite-init.js` for TYPO3 / external embeds.
   * Reference uses `window.location.origin` (admin frontend host).
   * Leave empty to use the current web origin, or set to your deployed widget host
   * (e.g. the legacy SPA origin) when generating snippets from native / another host.
   */
  widgetAssetBase: String(typedEnv.WIDGET_ASSET_BASE ?? '').trim(),
} as const;
