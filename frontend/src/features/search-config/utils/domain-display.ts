import type { DomainScope } from '@/features/search-config/types/search-config.types';
import {
  formatAllowedUrlDisplay,
  formatAllowedUrlScopeLabel,
  ruleFromAllowedDomainEntry,
} from '@/features/search-config/utils/allowed-url-rules';

export function domainScopeLabel(scope: DomainScope): string {
  switch (scope) {
    case 'page-only':
      return 'Only this page';
    case 'page-and-subpaths':
      return 'Page + subpaths';
    default:
      return 'Entire site';
  }
}

export function formatAllowedDomainPreview(domain: string, scope: DomainScope): string {
  const rule = ruleFromAllowedDomainEntry(domain, scope);
  if (rule) {
    return `${formatAllowedUrlDisplay(rule)} (${formatAllowedUrlScopeLabel(rule)})`;
  }
  const label = domainScopeLabel(scope);
  if (domain.includes('://')) return `${domain} (${label})`;
  return `https://${domain}/* (${label})`;
}
