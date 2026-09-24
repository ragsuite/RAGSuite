import { Platform } from 'react-native';

import { env } from '@/config/env';
import type { N8nInboundTemplate } from '@/features/configuration/utils/configuration-api-mappers';
import type { CurlCommandVariant } from '@/features/configuration/types/configuration.types';

function resolveApiBaseUrl(): string {
  if (Platform.OS === 'web' && typeof globalThis.window !== 'undefined') {
    const { protocol, host } = globalThis.window.location;
    return `${protocol}//${host}`;
  }
  return env.apiBaseUrl.replace(/\/$/, '');
}

function escapeShellSingleQuotes(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

export function buildCurlSnippet(variant: CurlCommandVariant, apiKey = 'Your_API_key'): string {
  const baseUrl = resolveApiBaseUrl();
  const token = escapeShellSingleQuotes(apiKey);

  if (variant === 'search') {
    return `curl -X POST "${baseUrl}/api/v1/search" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '{
    "query": "Your_Query",
    "topK": 5
  }'`;
  }

  return `curl -X POST "${baseUrl}/api/v1/retrieve" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '{
    "query": "Your_Query",
    "top_k": 5,
    "use_reranker": false
  }'`;
}

export function getN8nRequestDetails(apiKey = 'Your_API_key', template?: N8nInboundTemplate | null) {
  const baseUrl = resolveApiBaseUrl();
  const retrieveUrl = template?.retrieveUrl?.startsWith('http')
    ? template.retrieveUrl
    : `${baseUrl}${template?.retrieveUrl ?? '/api/v1/retrieve'}`;
  const bodyExample = template?.bodyExample ?? {
    query: 'What is our refund policy?',
    top_k: 5,
    use_reranker: false,
  };
  return {
    method: 'POST',
    url: retrieveUrl,
    authorization: `Bearer ${apiKey}`,
    contentType: 'application/json',
    body: JSON.stringify(bodyExample, null, 2),
  };
}

export function getN8nDisplayBearerToken(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed || trimmed === 'Your_API_key') {
    return '<YOUR_RAGSUITE_API_KEY>';
  }
  return trimmed;
}

/** Single monospace preview block for the n8n integration panel (reference UI). */
export function formatN8nRequestPreview(apiKey: string, template?: N8nInboundTemplate | null): string {
  const details = getN8nRequestDetails(apiKey, template);
  const token = getN8nDisplayBearerToken(apiKey);
  return `Method: ${details.method}
URL: ${details.url}
Header Authorization: Bearer ${token}
Header Content-Type: ${details.contentType}
Body: ${details.body}`;
}

export function buildN8nCurlSnippet(apiKey: string, template?: N8nInboundTemplate | null): string {
  if (template?.curlRetrieve && (!apiKey.trim() || apiKey === 'Your_API_key')) {
    return template.curlRetrieve;
  }
  const details = getN8nRequestDetails(apiKey, template);
  const token = escapeShellSingleQuotes(getN8nDisplayBearerToken(apiKey));
  return `curl -X POST "${details.url}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '${escapeShellSingleQuotes(details.body)}'`;
}

export function getN8nSelectPlaceholder(keyCount: number): string {
  return `Choose from ${keyCount} key(s) or paste below`;
}

/** Prefer frontend `API_URL` so MCP snippets match the active API host (e.g. ngrok). */
export function resolveMcpEndpointUrl(templateMcpUrl?: string | null): string {
  const fromEnv = String(env.apiBaseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/i, '');
  if (fromEnv) {
    // Trailing slash required — without it Starlette/FastAPI may 307 and break Cursor POST.
    return `${fromEnv}/api/v1/mcp/`;
  }
  const fromTemplate = String(templateMcpUrl || '').trim();
  if (fromTemplate) {
    return fromTemplate.endsWith('/') ? fromTemplate : `${fromTemplate}/`;
  }
  return 'https://your-ragsuite-host/api/v1/mcp/';
}

export type McpHostId =
  | 'cursor'
  | 'claude'
  | 'manus'
  | 'vscode'
  | 'windsurf'
  | 'chatgpt'
  | 'other';

export type McpConnectionFieldId = 'url' | 'authorization';

export type McpConnectionField = {
  id: McpConnectionFieldId;
  /** Header name for the auth row; empty for URL. */
  name: string;
  displayValue: string;
  copyValue: string;
};

function mcpSnippetHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${getN8nDisplayBearerToken(apiKey)}`,
  };
}

/** Mask a live API key for on-screen display; copy still uses the full value. */
export function maskMcpApiKeyForDisplay(apiKey: string): string {
  const token = getN8nDisplayBearerToken(apiKey);
  if (!token.startsWith('rgs_') || token.length < 20) {
    return token;
  }
  return `${token.slice(0, 12)}…${token.slice(-4)}`;
}

/** Shared URL + headers for the connection kit and “Other” host tab. */
export function getMcpConnectionFields(
  mcpUrl: string,
  apiKey = 'Your_API_key',
): McpConnectionField[] {
  const url = resolveMcpEndpointUrl(mcpUrl);
  const bearer = `Bearer ${getN8nDisplayBearerToken(apiKey)}`;
  const bearerDisplay = `Bearer ${maskMcpApiKeyForDisplay(apiKey)}`;
  return [
    {
      id: 'url',
      name: '',
      displayValue: url,
      copyValue: url,
    },
    {
      id: 'authorization',
      name: 'Authorization',
      displayValue: bearerDisplay,
      copyValue: bearer,
    },
  ];
}

export function buildMcpCursorSnippet(
  mcpUrl: string,
  apiKey = 'Your_API_key',
  _template?: { cursorSnippet?: string } | null,
): string {
  const payload = {
    mcpServers: {
      ragsuite: {
        url: resolveMcpEndpointUrl(mcpUrl),
        headers: mcpSnippetHeaders(apiKey),
      },
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function buildMcpClaudeDesktopSnippet(
  mcpUrl: string,
  apiKey = 'Your_API_key',
  _template?: { claudeDesktopSnippet?: string } | null,
): string {
  const payload = {
    mcpServers: {
      ragsuite: {
        type: 'http',
        url: resolveMcpEndpointUrl(mcpUrl),
        headers: mcpSnippetHeaders(apiKey),
      },
    },
  };
  return JSON.stringify(payload, null, 2);
}

/** Manus uses the same Streamable HTTP shape as Claude Desktop. */
export function buildMcpManusSnippet(mcpUrl: string, apiKey = 'Your_API_key'): string {
  return buildMcpClaudeDesktopSnippet(mcpUrl, apiKey);
}

/** VS Code user mcp.json uses `servers`, not `mcpServers`. */
export function buildMcpVsCodeSnippet(mcpUrl: string, apiKey = 'Your_API_key'): string {
  const payload = {
    servers: {
      ragsuite: {
        type: 'http',
        url: resolveMcpEndpointUrl(mcpUrl),
        headers: mcpSnippetHeaders(apiKey),
      },
    },
  };
  return JSON.stringify(payload, null, 2);
}

/** Windsurf remote MCP uses serverUrl plus headers. */
export function buildMcpWindsurfSnippet(mcpUrl: string, apiKey = 'Your_API_key'): string {
  const payload = {
    mcpServers: {
      ragsuite: {
        serverUrl: resolveMcpEndpointUrl(mcpUrl),
        headers: mcpSnippetHeaders(apiKey),
      },
    },
  };
  return JSON.stringify(payload, null, 2);
}
