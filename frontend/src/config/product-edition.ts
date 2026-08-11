import type { EditionVariant } from '@/shared/components/brand';

export type ProductEdition = Exclude<EditionVariant, 'beta'>;

type ResolveOptions = {
  /**
   * True when Enterprise frontend modules are attached (sibling EE / Docker EE /
   * installed bundle). CE stubs set this false.
   */
  enterpriseAttached?: boolean;
};

/**
 * Product edition badge.
 * Default: Community. Shows Enterprise when EE UI is attached, or when
 * `EXPO_PUBLIC_PRODUCT_EDITION=enterprise` is set for dedicated EE builds.
 */
export function getProductEdition(options?: ResolveOptions): ProductEdition {
  const env = (process.env.EXPO_PUBLIC_PRODUCT_EDITION || '').trim().toLowerCase();
  if (env === 'enterprise') return 'enterprise';
  if (env === 'community') return 'community';
  if (options?.enterpriseAttached) return 'enterprise';
  return 'community';
}
