import type { DomainScope } from '@/features/search-config/types/search-config.types';

export type AllowedUrlRule = {
  type: 'DOMAIN' | 'PAGE';
  hostname: string;
  pathname: string;
  normalizedUrl: string;
  allowSubpaths?: boolean;
};

export type AllowedUrlEntry = string | AllowedUrlRule;

function ensureUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.includes('://') ? trimmed : `https://${trimmed}`;
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  return normalized.startsWith('www.') ? normalized.slice(4) : normalized;
}

function normalizePathname(pathname: string): string {
  let normalized = pathname.trim();
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized !== '/' && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized || '/';
}

function buildNormalizedUrl(hostname: string, pathname: string): string {
  if (pathname === '/') return `https://${hostname}/`;
  return `https://${hostname}${pathname}`;
}

export function buildAllowedUrlRuleFromInput(input: string, scope: DomainScope): AllowedUrlRule | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let raw = trimmed;
  let allowSubpaths = scope === 'page-and-subpaths';
  if (raw.endsWith('//*')) {
    allowSubpaths = true;
    raw = raw.slice(0, -3);
  } else if (raw.endsWith('/*')) {
    allowSubpaths = true;
    raw = raw.slice(0, -2);
  }

  try {
    const url = new URL(ensureUrl(raw));
    if (url.pathname.includes('://') || /\/https?:\/\//i.test(url.href)) {
      return null;
    }
    const hostname = normalizeHostname(url.hostname);
    if (!hostname) return null;

    let pathname = normalizePathname(url.pathname || '/');
    if (scope === 'entire-site') {
      pathname = '/';
      allowSubpaths = false;
    } else if (scope === 'page-and-subpaths') {
      allowSubpaths = true;
    } else {
      allowSubpaths = false;
    }

    const type: AllowedUrlRule['type'] = pathname === '/' ? 'DOMAIN' : 'PAGE';
    return {
      type,
      hostname,
      pathname,
      normalizedUrl: buildNormalizedUrl(hostname, pathname),
      allowSubpaths,
    };
  } catch {
    return null;
  }
}

export function normalizeAllowedUrlEntry(entry: AllowedUrlEntry): AllowedUrlRule | null {
  if (!entry) return null;
  if (typeof entry !== 'string') {
    const hostname = entry.hostname ? normalizeHostname(entry.hostname) : '';
    if (!hostname || (entry.type !== 'DOMAIN' && entry.type !== 'PAGE')) return null;
    const pathname = normalizePathname(entry.pathname || '/');
    return {
      type: entry.type,
      hostname,
      pathname,
      normalizedUrl: entry.normalizedUrl || buildNormalizedUrl(hostname, pathname),
      allowSubpaths: Boolean(entry.allowSubpaths),
    };
  }

  let raw = entry.trim();
  if (!raw) return null;
  let allowSubpaths = false;
  if (raw.endsWith('//*')) {
    allowSubpaths = true;
    raw = raw.slice(0, -3);
  } else if (raw.endsWith('/*')) {
    allowSubpaths = true;
    raw = raw.slice(0, -2);
  }

  try {
    const url = new URL(ensureUrl(raw));
    if (url.pathname.includes('://') || /\/https?:\/\//i.test(url.href)) {
      return null;
    }
    const hostname = normalizeHostname(url.hostname);
    if (!hostname) return null;
    const pathname = normalizePathname(url.pathname || '/');
    const type: AllowedUrlRule['type'] = pathname === '/' ? 'DOMAIN' : 'PAGE';
    return {
      type,
      hostname,
      pathname,
      normalizedUrl: buildNormalizedUrl(hostname, pathname),
      allowSubpaths,
    };
  } catch {
    return null;
  }
}

export function allowedDomainRuleKey(rule: AllowedUrlRule): string {
  return `${rule.type}:${rule.hostname}:${rule.pathname}:${rule.allowSubpaths ? 1 : 0}`;
}

export function allowedUrlRuleToDomainString(rule: AllowedUrlRule): string {
  return formatAllowedUrlDisplay(rule);
}

/** Display + list label formatting aligned with reference web `formatAllowedUrl`. */
export function formatAllowedUrlDisplay(rule: AllowedUrlRule): string {
  const normalized = rule.normalizedUrl || buildNormalizedUrl(rule.hostname, rule.pathname);
  if (rule.type === 'DOMAIN' || rule.pathname === '/') {
    return `${normalized}/*`;
  }
  if (rule.allowSubpaths) {
    return `${normalized}/*`;
  }
  return normalized;
}

/** Scope label aligned with reference web `formatAllowedUrlScope`. */
export function formatAllowedUrlScopeLabel(rule: AllowedUrlRule): string {
  if (rule.type === 'DOMAIN' || rule.pathname === '/') {
    return 'Entire site';
  }
  if (rule.allowSubpaths) {
    return 'Page + subpaths';
  }
  return 'Only this page';
}

export function ruleFromAllowedDomainEntry(domain: string, scope: DomainScope): AllowedUrlRule | null {
  return (
    normalizeAllowedUrlEntry(domain) ?? buildAllowedUrlRuleFromInput(domain, scope)
  );
}

export function inferDomainScope(rule: AllowedUrlRule): DomainScope {
  if (rule.type === 'DOMAIN' || rule.pathname === '/') return 'entire-site';
  return rule.allowSubpaths ? 'page-and-subpaths' : 'page-only';
}

export function normalizeAllowedUrlEntries(entries: AllowedUrlEntry[]): AllowedUrlRule[] {
  const seen = new Set<string>();
  const result: AllowedUrlRule[] = [];
  for (const entry of entries) {
    const rule = normalizeAllowedUrlEntry(entry);
    if (!rule) continue;
    const key = `${rule.type}:${rule.hostname}:${rule.pathname}:${rule.allowSubpaths ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(rule);
  }
  return result;
}
