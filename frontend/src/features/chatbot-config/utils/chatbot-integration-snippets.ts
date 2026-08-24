import { Platform } from 'react-native';

import { env } from '@/config/env';
import { WEB_INTEGRATION } from '@/features/chatbot-config/data/integration-install-copy';
import { resolveBrowserApiBaseUrl } from '@/shared/utils/resolve-browser-api-base-url';
import {
  ensureAbsoluteHttpUrl,
  resolveWidgetAssetBase,
} from '@/shared/utils/resolve-widget-asset-base';
import {
  buildReactNativeIntegrationSnippet,
  type MobileIntegrationFeature,
} from '@/shared/utils/mobile-integration-snippet';
import { WIDGET_EMBED_ASSET_VERSION } from '@/shared/utils/widget-embed-asset-version';
import { buildWidgetHostCspAllowlist, buildWidgetHostCspHtmlComment } from '@/shared/utils/widget-host-csp';

const WIDGET_VERSION = 'v1';

function pageOrigin(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return null;
}

/** Align embed script API host with reference ChatbotConfiguration generateWebScript. */
export function normalizeChatbotEmbedApiEndpoint(rawEndpoint?: string): string {
  const assetOrigin = resolveWidgetAssetBase({
    configuredBase: env.widgetAssetBase,
    pageOrigin: pageOrigin(),
    apiBaseUrl: env.apiBaseUrl,
  });
  return resolveBrowserApiBaseUrl(rawEndpoint ?? env.apiBaseUrl, {
    pageOrigin: pageOrigin() ?? assetOrigin,
    assetOrigin,
  });
}

/** Host that serves `/widget/v1/ragsuite-init.js` (reference: window.location.origin). */
export function resolveChatbotWidgetAssetBase(): string {
  return resolveWidgetAssetBase({
    configuredBase: env.widgetAssetBase,
    pageOrigin: pageOrigin(),
    apiBaseUrl: env.apiBaseUrl,
  });
}

/** CSP allowlist for the current widget asset host + API origin (not hardcoded). */
export function buildChatbotWebCspAllowlist(
  apiEndpoint = normalizeChatbotEmbedApiEndpoint(),
  widgetAssetBase = resolveChatbotWidgetAssetBase(),
): string {
  return buildWidgetHostCspAllowlist(widgetAssetBase, apiEndpoint);
}

export function buildChatbotWebIntegrationSnippet(
  cacheBust = WIDGET_EMBED_ASSET_VERSION,
  projectId = 'your-project-id-here',
  apiEndpoint = normalizeChatbotEmbedApiEndpoint(),
  widgetAssetBase = resolveChatbotWidgetAssetBase(),
): string {
  const assetBase = ensureAbsoluteHttpUrl(widgetAssetBase) || widgetAssetBase.replace(/\/$/, '');
  const apiBase = ensureAbsoluteHttpUrl(apiEndpoint) || apiEndpoint.replace(/\/$/, '');
  const bust = String(cacheBust || WIDGET_EMBED_ASSET_VERSION);
  const cspComment = buildWidgetHostCspHtmlComment(assetBase, apiBase);
  return `<!-- ${WEB_INTEGRATION.commentTitle} -->
<!-- ${WEB_INTEGRATION.commentPlacement} -->
${cspComment ? `${cspComment}\n` : ''}<!-- Do not move/re-parent the iframe until RAGSuiteWidget is bound; avoid display:none ancestors. -->
<!-- Single-project widget embed -->
<script
  src="${assetBase}/widget/${WIDGET_VERSION}/ragsuite-init.js?v=${bust}"
  data-ragsuite-project-id="${projectId}"
  data-api-endpoint="${apiBase}"
  data-cache-bust="${bust}"
  defer>
</script>
`;
}

export function buildChatbotMobileIntegrationSnippet(options?: {
  projectId?: string;
  apiKey?: string;
  endpoint?: string;
  features?: MobileIntegrationFeature[];
}): string {
  return buildReactNativeIntegrationSnippet({
    projectId: options?.projectId,
    apiKey: options?.apiKey,
    endpoint: normalizeChatbotEmbedApiEndpoint(options?.endpoint),
    features: options?.features ?? ['chat'],
  });
}
