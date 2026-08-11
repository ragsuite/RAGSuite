import type { Href } from 'expo-router';

function splitPathQueryHash(url: string): { path: string; suffix: string } {
  const trimmed = url.trim();
  const hashIndex = trimmed.indexOf('#');
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const queryIndex = withoutHash.indexOf('?');
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    suffix: `${query}${hash}`,
  };
}

/**
 * Maps backend / legacy SPA notification paths to Expo Router `href` values.
 */
export function hrefFromActionUrl(url: string): Href {
  const { path, suffix } = splitPathQueryHash(url);

  if (path === '/api-keys' || path.startsWith('/api-keys/')) {
    return (`/(app)/configuration${suffix || '?tab=api-keys'}`) as Href;
  }
  if (path === '/configuration' || path.startsWith('/configuration/')) {
    return (`/(app)/configuration${suffix}`) as Href;
  }
  if (path === '/n8n' || path.startsWith('/n8n/')) {
    return (`/(app)/configuration${suffix || '?tab=n8n'}`) as Href;
  }
  if (path === '/webhooks' || path.startsWith('/webhooks/')) {
    return ('/(app)/configuration') as Href;
  }
  if (path === '/integrations' || path.startsWith('/integrations/')) {
    return ('/(app)/(tabs)/crawl-management') as Href;
  }
  if (path === '/feedback' || path.startsWith('/feedback/')) {
    return (`/(app)/feedback-moderation${url.slice('/feedback'.length)}`) as Href;
  }
  if (path === '/audit-logs' || path.startsWith('/audit-logs/')) {
    return (`/(app)/audit-logs${url.slice('/audit-logs'.length)}`) as Href;
  }
  if (path === '/history' || path.startsWith('/history/')) {
    return (`/(app)/history${url.slice('/history'.length)}`) as Href;
  }
  if (path.startsWith('/profile')) {
    return (`/(app)/profile${url.slice('/profile'.length)}`) as Href;
  }
  if (path.startsWith('/settings')) {
    return (`/(app)/(tabs)/settings${url.slice('/settings'.length)}`) as Href;
  }
  if (path === '/crawl' || path.startsWith('/crawl/')) {
    return (`/(app)/(tabs)/crawl-management${url.slice('/crawl'.length)}`) as Href;
  }
  if (path.startsWith('/documents')) {
    return (`/(app)/documents${url.slice('/documents'.length)}`) as Href;
  }
  if (path.startsWith('/projects')) {
    return (`/(app)/projects${url.slice('/projects'.length)}`) as Href;
  }
  if (!url.startsWith('/')) {
    return (`/(app)/${url}`) as Href;
  }
  return (`/(app)${url}`) as Href;
}
