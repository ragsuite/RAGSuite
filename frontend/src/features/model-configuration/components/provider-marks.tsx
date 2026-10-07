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
        <G key={angle} transform={`rotate(${angle} 12 12)`}>
          <Path d="M9.6 10.6V6.4a3.3 3.3 0 0 1 5.9-1.5l1.7 1" />
        </G>
      ))}
    </OutlineSvg>
  );
}

/**
 * Official Microsoft Azure lettermark (vscode-azureresourcegroups `azure.svg`).
 * Filled monochrome (host colour) — the real mark needs evenodd fill; stroking
 * the construction paths would show internal seams.
 */
export function AzureOpenAiMark({ size = DEFAULT_SIZE, color = DEFAULT_COLOR }: ProviderMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Path
        fill={color}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M28.1854 10.081C29.0086 7.64193 31.2961 5.99976 33.8703 5.99976H36.9987H38.4459L38.446 6.00005H62.1284C64.7027 6.00005 66.9901 7.64222 67.8133 10.0813L92.1131 82.0807C93.4258 85.97 90.533 89.9994 86.4282 89.9994H59.0001V89.973C58.8125 89.9904 58.6218 89.9994 58.4285 89.9994H58.3233C57.0345 89.9994 55.7799 89.5844 54.7454 88.8158L36.4266 75.2076L32.812 85.9178C31.9888 88.3569 29.7014 89.9991 27.1271 89.9991H9.57056C5.46579 89.9991 2.57303 85.9697 3.88564 82.0804L28.1854 10.081ZM23.4277 60.5684L57.1306 85.6049C57.4755 85.8611 57.8937 85.9994 58.3233 85.9994H58.4285C59.7967 85.9994 60.761 84.6563 60.3234 83.3598L46.9041 43.5989L41.2017 58.759L40.7142 60.0549H39.3297H22.7397L23.4277 60.5684ZM86.4282 85.9994H64.0881C64.5181 84.7919 64.568 83.4279 64.1134 82.0807L39.8136 10.0813C39.8044 10.0541 39.795 10.027 39.7855 10H62.1284C62.9865 10 63.749 10.5474 64.0234 11.3604L88.3232 83.3598C88.7607 84.6563 87.7965 85.9994 86.4282 85.9994Z"
      />
    </Svg>
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
  azure_openai: AzureOpenAiMark,
  anthropic: AnthropicMark,
  mistral: MistralMark,
  gemini: GeminiMark,
  ollama: OllamaMark,
};

export function ProviderMark({ provider, ...props }: ProviderMarkProps & { provider: ModelProviderKey }) {
  const Mark = PROVIDER_MARKS[provider];
  return <Mark {...props} />;
}
