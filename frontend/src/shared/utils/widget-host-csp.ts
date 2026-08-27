import { ensureAbsoluteHttpUrl } from '@/shared/utils/resolve-widget-asset-base';

/** Origin of a widget asset or API URL (bare hosts become https). */
export function originFromWidgetUrl(raw: string | null | undefined): string {
  const absolute = ensureAbsoluteHttpUrl(raw);
  if (!absolute) return '';
  try {
    return new URL(absolute).origin;
  } catch {
    return '';
  }
}

/**
 * Copy-paste CSP allowlist for DACH hosts that already send a policy.
 * `connect-src` includes the API origin when it differs from the widget host.
 */
export function buildWidgetHostCspAllowlist(
  assetOrigin: string,
  apiOrigin?: string | null,
): string {
  const asset = originFromWidgetUrl(assetOrigin);
  const api = originFromWidgetUrl(apiOrigin || assetOrigin);
  if (!asset) return '';
  const connect = api && api !== asset ? `${asset} ${api}` : asset;
  return [
    `frame-src   ${asset};`,
    `script-src  ${asset};`,
    `style-src   ${asset};`,
    `img-src     ${asset};`,
    `connect-src ${connect};`,
  ].join('\n');
}

/** HTML comment block to ship next to the embed script. */
export function buildWidgetHostCspHtmlComment(
  assetOrigin: string,
  apiOrigin?: string | null,
): string {
  const allowlist = buildWidgetHostCspAllowlist(assetOrigin, apiOrigin);
  if (!allowlist) return '';
  return `<!-- If your site sends a Content-Security-Policy, add these. If it does not, skip this block. German/DACH hosts typically need frame-src. -->
<!-- For local framing (localhost/127.0.0.1), also add those hosts to this project's Allowed Domains. -->
<!--
${allowlist}
-->`;
}
