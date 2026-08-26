import { Platform } from 'react-native';

import { env } from '@/config/env';
import { SEARCH_WEB_INTEGRATION } from '@/features/search-config/data/search-integration-install-copy';
import { resolveBrowserApiBaseUrl } from '@/shared/utils/resolve-browser-api-base-url';
import {
  ensureAbsoluteHttpUrl,
  resolveWidgetAssetBase,
} from '@/shared/utils/resolve-widget-asset-base';
import {
  buildReactNativeIntegrationSnippet,
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

/** Align embed script API host with reference SearchConfiguration generateWebScript. */
export function normalizeSearchEmbedApiEndpoint(rawEndpoint?: string): string {
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

export function resolveSearchWidgetAssetBase(): string {
  return resolveWidgetAssetBase({
    configuredBase: env.widgetAssetBase,
    pageOrigin: pageOrigin(),
    apiBaseUrl: env.apiBaseUrl,
  });
}

/** CSP allowlist for the current widget asset host + API origin (not hardcoded). */
export function buildSearchWebCspAllowlist(
  apiEndpoint = normalizeSearchEmbedApiEndpoint(),
  widgetAssetBase = resolveSearchWidgetAssetBase(),
): string {
  return buildWidgetHostCspAllowlist(widgetAssetBase, apiEndpoint);
}

export function buildSearchWebIntegrationSnippet(
  cacheBust = WIDGET_EMBED_ASSET_VERSION,
  projectId = 'your-project-id-here',
  apiEndpoint = normalizeSearchEmbedApiEndpoint(),
  widgetAssetBase = resolveSearchWidgetAssetBase(),
): string {
  const assetBase = ensureAbsoluteHttpUrl(widgetAssetBase) || widgetAssetBase.replace(/\/$/, '');
  const apiBase = ensureAbsoluteHttpUrl(apiEndpoint) || apiEndpoint.replace(/\/$/, '');
  const bust = String(cacheBust || WIDGET_EMBED_ASSET_VERSION);
  const cspComment = buildWidgetHostCspHtmlComment(assetBase, apiBase);
  return `<!-- ${SEARCH_WEB_INTEGRATION.commentTitle} -->
<!-- ${SEARCH_WEB_INTEGRATION.commentPlacement} -->
${cspComment ? `${cspComment}\n` : ''}<!-- If you re-parent after RAGSuiteSearchWidget binds, move the host root — never the inner iframe alone. Avoid display:none ancestors. -->
<!-- Example optional mount: data-container="#your-slot" (else mounts to body, not head) -->
<!-- Single-project search widget embed -->
<script
  src="${assetBase}/search-widget/${WIDGET_VERSION}/ragsuite-init.js?v=${bust}"
  data-ragsuite-project-id="${projectId}"
  data-api-endpoint="${apiBase}"
  data-cache-bust="${bust}"
  defer>
</script>`;
}

export function buildSearchMobileIntegrationSnippet(options?: {
  projectId?: string;
  apiKey?: string;
  endpoint?: string;
}): string {
  return buildReactNativeIntegrationSnippet({
    projectId: options?.projectId,
    apiKey: options?.apiKey,
    endpoint: normalizeSearchEmbedApiEndpoint(options?.endpoint),
    features: ['search'],
  });
}
