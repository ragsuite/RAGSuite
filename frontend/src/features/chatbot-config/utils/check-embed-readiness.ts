import { normalizeChatbotEmbedApiEndpoint, resolveChatbotWidgetAssetBase } from '@/features/chatbot-config/utils/chatbot-integration-snippets';

const WIDGET_VERSION = 'v1';

export type EmbedProbeStatus = 'ok' | 'missing' | 'unreachable' | 'blocked';

export type EmbedProbeResult = {
  label: string;
  url: string;
  status: EmbedProbeStatus;
  httpStatus?: number;
  detail?: string;
};

export type EmbedReadinessReport = {
  overall: 'ready' | 'partial' | 'failed';
  init: EmbedProbeResult;
  loader: EmbedProbeResult;
  checkedAt: string;
};

export function buildChatbotEmbedAssetUrls(options?: {
  assetBase?: string;
  apiEndpoint?: string;
  cacheBust?: string;
}): {
  initUrl: string;
  loaderCandidates: string[];
} {
  const assetBase = (options?.assetBase ?? resolveChatbotWidgetAssetBase()).replace(/\/$/, '');
  const apiEndpoint = (options?.apiEndpoint ?? normalizeChatbotEmbedApiEndpoint()).replace(/\/$/, '');
  const bust = options?.cacheBust ?? String(Date.now());

  // Widget scripts are served from the asset host (same origin as ragsuite-init.js).
  // API host paths remain as fallback for legacy deployments that proxy /api/v1 only.
  const loaderCandidates = Array.from(
    new Set([
      `${apiEndpoint}/widget/${WIDGET_VERSION}/loader.js?v=${bust}`,
      `${apiEndpoint}/widget/${WIDGET_VERSION}/widget.umd.js?v=${bust}`,
      `${assetBase}/widget/${WIDGET_VERSION}/loader.js?v=${bust}`,
      `${assetBase}/widget/${WIDGET_VERSION}/widget.umd.js?v=${bust}`,
    ]),
  );

  return {
    initUrl: `${assetBase}/widget/${WIDGET_VERSION}/ragsuite-init.js?v=${bust}`,
    loaderCandidates,
  };
}

async function probeUrl(url: string): Promise<Omit<EmbedProbeResult, 'label'>> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      // Script tags don't need CORS; fetch does. Prefer CORS when available.
      mode: 'cors',
      cache: 'no-store',
    });

    if (response.ok) {
      return { url, status: 'ok', httpStatus: response.status };
    }

    if (response.status === 404) {
      return {
        url,
        status: 'missing',
        httpStatus: response.status,
        detail: 'HTTP 404',
      };
    }

    return {
      url,
      status: 'unreachable',
      httpStatus: response.status,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    // Browser CORS failures usually look like TypeError/Failed to fetch while script tags still work.
    const blocked =
      /Failed to fetch|NetworkError|CORS|cross-origin|Load failed/i.test(message) ||
      message === 'Network request failed';
    return {
      url,
      status: blocked ? 'blocked' : 'unreachable',
      detail: message,
    };
  }
}

/**
 * Probe init (admin/asset host) + loader/UMD (API/static host) for TYPO3 embed readiness.
 */
export async function checkChatbotEmbedReadiness(options?: {
  assetBase?: string;
  apiEndpoint?: string;
}): Promise<EmbedReadinessReport> {
  const { initUrl, loaderCandidates } = buildChatbotEmbedAssetUrls(options);

  const initProbe = await probeUrl(initUrl);
  const init: EmbedProbeResult = {
    label: 'ragsuite-init.js',
    ...initProbe,
  };

  let loader: EmbedProbeResult = {
    label: 'loader.js / widget.umd.js',
    url: loaderCandidates[0] ?? initUrl,
    status: 'missing',
    detail: 'No loader candidates',
  };

  for (const candidate of loaderCandidates) {
    const probe = await probeUrl(candidate);
    if (probe.status === 'ok') {
      loader = {
        label: candidate.includes('widget.umd.js') ? 'widget.umd.js' : 'loader.js',
        ...probe,
      };
      break;
    }
    // Keep the most actionable failure (prefer missing over blocked for last tried URL).
    loader = {
      label: candidate.includes('widget.umd.js') ? 'widget.umd.js' : 'loader.js',
      ...probe,
    };
    if (probe.status === 'missing') {
      // try next candidate — 404 on one path doesn't mean all missing
      continue;
    }
  }

  let overall: EmbedReadinessReport['overall'] = 'failed';
  if (init.status === 'ok' && loader.status === 'ok') {
    overall = 'ready';
  } else if (init.status === 'ok' && (loader.status === 'blocked' || loader.status === 'unreachable')) {
    // Init is served; loader may still work via <script> even if fetch is CORS-blocked.
    overall = 'partial';
  } else if (init.status === 'ok' && loader.status === 'missing') {
    overall = 'failed';
  } else if (init.status === 'blocked' || loader.status === 'blocked') {
    overall = 'partial';
  }

  return {
    overall,
    init,
    loader,
    checkedAt: new Date().toISOString(),
  };
}
