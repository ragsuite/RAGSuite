import { Platform } from 'react-native';

import { env } from '@/config/env';
import { SEARCH_WEB_INTEGRATION } from '@/features/search-config/data/search-integration-install-copy';
import { resolveBrowserApiBaseUrl } from '@/shared/utils/resolve-browser-api-base-url';
import { resolveWidgetAssetBase } from '@/shared/utils/resolve-widget-asset-base';
import {
  buildReactNativeIntegrationSnippet,
} from '@/shared/utils/mobile-integration-snippet';

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

export function buildSearchWebIntegrationSnippet(
  cacheBust = String(Date.now()),
  projectId = 'your-project-id-here',
  apiEndpoint = normalizeSearchEmbedApiEndpoint(),
  widgetAssetBase = resolveSearchWidgetAssetBase(),
): string {
  const assetBase = widgetAssetBase.replace(/\/$/, '');
  const apiBase = apiEndpoint.replace(/\/$/, '');
  return `<!-- ${SEARCH_WEB_INTEGRATION.commentTitle} -->
<!-- ${SEARCH_WEB_INTEGRATION.commentPlacement} -->
<!-- Single-project search widget embed -->
<script
  src="${assetBase}/search-widget/${WIDGET_VERSION}/ragsuite-init.js?v=${cacheBust}"
  data-ragsuite-project-id="${projectId}"
  data-api-endpoint="${apiBase}"
  data-cache-bust="${cacheBust}"
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
