import React from 'react';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import type { ModelProviderKey } from '@/features/model-configuration/types/model-configuration.types';

export type ProviderMarkProps = {
  size?: number;
  color?: string;
};

const DEFAULT_SIZE = 18;
const DEFAULT_COLOR = '#111111';
const OPENAI_PETAL_ANGLES = [0, 60, 120, 180, 240, 300] as const;

/** Monochrome line-art frame: every mark is stroke-only and takes its colour from the host. */
function OutlineSvg({
  size = DEFAULT_SIZE,
  color = DEFAULT_COLOR,
  viewBox = '0 0 24 24',
  strokeWidth = 1.5,
  children,
}: ProviderMarkProps & { viewBox?: string; strokeWidth?: number; children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function OpenAiMark(props: ProviderMarkProps) {
  return (
    <OutlineSvg {...props}>
      {OPENAI_PETAL_ANGLES.map((angle) => (
        <G key={angle} rotation={angle} origin="12, 12">
          <Path d="M9.6 10.6V6.4a3.3 3.3 0 0 1 5.9-1.5l1.7 1" />
        </G>
      ))}
    </OutlineSvg>
  );
}

export function AnthropicMark(props: ProviderMarkProps) {
  return (
    <OutlineSvg {...props} viewBox="-1.5 -1.5 27 27" strokeWidth={1.6}>
      <Path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </OutlineSvg>
  );
}

export function MistralMark(props: ProviderMarkProps) {
  return (
    <OutlineSvg {...props}>
      <Path d="M2.5 3.5h4v3.6h3.5v3.4h4V7.1h3.5V3.5h4v17h-4v-6.8H14v3.4h-4v-3.4H6.5v6.8h-4Z" />
    </OutlineSvg>
  );
}

export function GeminiMark(props: ProviderMarkProps) {
  return (
    <OutlineSvg {...props}>
      <Path d="M12 3C12.6 7.6 16.4 11.4 21 12C16.4 12.6 12.6 16.4 12 21C11.4 16.4 7.6 12.6 3 12C7.6 11.4 11.4 7.6 12 3Z" />
    </OutlineSvg>
  );
}

export function OllamaMark(props: ProviderMarkProps) {
  const color = props.color ?? DEFAULT_COLOR;
  return (
    <OutlineSvg {...props}>
      <Path d="M7.6 10.2V5.2a1.6 1.6 0 0 1 3.2 0v2.5" />
      <Path d="M13.2 7.7V5.2a1.6 1.6 0 0 1 3.2 0v5" />
      <Path d="M10.8 7.7a4.6 4.6 0 0 1 2.4 0" />
      <Path d="M7.6 10.2C6 11.2 5.2 12.8 5.2 14.6v5.9" />
      <Path d="M16.4 10.2c1.6 1 2.4 2.6 2.4 4.4v5.9" />
      <Ellipse cx={12} cy={15.8} rx={3} ry={2.2} />
      <Path d="M11.4 15.4h1.2" />
      <Circle cx={9.2} cy={12.4} r={0.5} fill={color} />
      <Circle cx={14.8} cy={12.4} r={0.5} fill={color} />
    </OutlineSvg>
  );
}

export const PROVIDER_MARKS: Record<ModelProviderKey, React.ComponentType<ProviderMarkProps>> = {
  openai: OpenAiMark,
  anthropic: AnthropicMark,
  mistral: MistralMark,
  gemini: GeminiMark,
  ollama: OllamaMark,
};

export function ProviderMark({ provider, ...props }: ProviderMarkProps & { provider: ModelProviderKey }) {
  const Mark = PROVIDER_MARKS[provider];
  return <Mark {...props} />;
}
