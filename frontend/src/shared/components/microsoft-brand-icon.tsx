import type { LucideProps } from 'lucide-react-native';
import React from 'react';
import Svg, { Rect } from 'react-native-svg';

/**
 * Official Microsoft four-square mark (red / green / blue / yellow).
 * Used for Sign in with Microsoft. Ignores theme `color`, like GoogleBrandIcon.
 */
export function MicrosoftBrandIcon({ size = 20 }: LucideProps) {
  const s = typeof size === 'number' ? size : 20;
  return (
    <Svg
      width={s}
      height={s}
      viewBox="0 0 23 23"
      accessibilityRole="image"
      accessibilityLabel="Microsoft">
      <Rect x={1} y={1} width={10} height={10} fill="#F25022" />
      <Rect x={12} y={1} width={10} height={10} fill="#7FBA00" />
      <Rect x={1} y={12} width={10} height={10} fill="#00A4EF" />
      <Rect x={12} y={12} width={10} height={10} fill="#FFB900" />
    </Svg>
  );
}
