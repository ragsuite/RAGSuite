import { Platform } from 'react-native';

import { componentTokens, type ComponentRadius } from '@/theme/component-tokens';

type PlatformKind = 'web' | 'ios' | 'android';

export type SurfaceRadius = ComponentRadius;

/** All platforms use brand surface radii from componentTokens (8/12/16px). */
export function resolveSurfaceRadius(_opts: {
  platform?: PlatformKind;
  isCompact: boolean;
}): SurfaceRadius {
  return {
    card: componentTokens.cardRadius,
    modal: componentTokens.modalRadius,
    button: componentTokens.buttonRadius,
    input: componentTokens.inputRadius,
  };
}

export function isWebParitySurfaces(opts: {
  platform?: PlatformKind;
  isCompact: boolean;
}): boolean {
  const platform = opts.platform ?? (Platform.OS as PlatformKind);
  return platform === 'web' && !opts.isCompact;
}
