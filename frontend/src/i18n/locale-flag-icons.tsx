import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type FlagProps = {
  size?: number;
};

const RATIO = 1.4;

function FlagFrame({ size, children }: FlagProps & { children: React.ReactNode }) {
  const height = size ?? 20;
  const width = height * RATIO;
  return (
    <Svg width={width} height={height} viewBox="0 0 28 20">
      <Rect x={0} y={0} width={28} height={20} rx={2} fill="#e2e8f0" />
      {children}
      <Rect
        x={0.5}
        y={0.5}
        width={27}
        height={19}
        rx={1.5}
        fill="none"
        stroke="rgba(0,0,0,0.12)"
        strokeWidth={1}
      />
    </Svg>
  );
}

function FlagUS({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={28} height={20} fill="#b22234" />
      {[1, 3, 5, 7, 9].map((row) => (
        <Rect key={row} x={0} y={row * 2} width={28} height={2} fill="#ffffff" />
      ))}
      <Rect x={0} y={0} width={11} height={11} fill="#3c3b6e" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Circle key={i} cx={2 + (i % 3) * 3.2} cy={2 + Math.floor(i / 3) * 2.4} r={0.55} fill="#ffffff" />
      ))}
    </FlagFrame>
  );
}

function FlagGB({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={28} height={20} fill="#012169" />
      <Path d="M0 0 L28 20 M28 0 L0 20" stroke="#ffffff" strokeWidth={3.2} />
      <Path d="M0 0 L28 20 M28 0 L0 20" stroke="#c8102e" strokeWidth={1.4} />
      <Rect x={11.5} y={0} width={5} height={20} fill="#ffffff" />
      <Rect x={0} y={7.5} width={28} height={5} fill="#ffffff" />
      <Rect x={12.5} y={0} width={3} height={20} fill="#c8102e" />
      <Rect x={0} y={8.5} width={28} height={3} fill="#c8102e" />
    </FlagFrame>
  );
}

function FlagIN({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={28} height={6.7} fill="#ff9933" />
      <Rect x={0} y={6.7} width={28} height={6.6} fill="#ffffff" />
      <Rect x={0} y={13.3} width={28} height={6.7} fill="#138808" />
      <Circle cx={14} cy={10} r={2.4} fill="none" stroke="#000080" strokeWidth={0.8} />
      <Circle cx={14} cy={10} r={0.8} fill="#000080" />
    </FlagFrame>
  );
}

function FlagES({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={28} height={5} fill="#aa151b" />
      <Rect x={0} y={5} width={28} height={10} fill="#f1bf00" />
      <Rect x={0} y={15} width={28} height={5} fill="#aa151b" />
    </FlagFrame>
  );
}

function FlagFR({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={9.3} height={20} fill="#0055a4" />
      <Rect x={9.3} y={0} width={9.4} height={20} fill="#ffffff" />
      <Rect x={18.7} y={0} width={9.3} height={20} fill="#ef4135" />
    </FlagFrame>
  );
}

function FlagDE({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={28} height={6.7} fill="#000000" />
      <Rect x={0} y={6.7} width={28} height={6.6} fill="#dd0000" />
      <Rect x={0} y={13.3} width={28} height={6.7} fill="#ffce00" />
    </FlagFrame>
  );
}

function FlagSA({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={28} height={20} fill="#006c35" />
      <Rect x={8} y={9} width={12} height={2} rx={1} fill="#ffffff" />
    </FlagFrame>
  );
}

function FlagBR({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={28} height={20} fill="#009b3a" />
      <Path d="M14 2 L24 10 L14 18 L4 10 Z" fill="#ffdf00" />
      <Circle cx={14} cy={10} r={3.5} fill="#002776" />
    </FlagFrame>
  );
}

function FlagCN({ size = 20 }: FlagProps) {
  return (
    <FlagFrame size={size}>
      <Rect x={0} y={0} width={28} height={20} fill="#de2910" />
      <Circle cx={6.5} cy={6.5} r={2.8} fill="#ffde00" />
      {[
        [11.5, 3.2],
        [13.2, 4.8],
        [13.8, 7.2],
        [12.4, 9.2],
      ].map(([cx, cy], index) => (
        <Circle key={index} cx={cx} cy={cy} r={0.9} fill="#ffde00" />
      ))}
    </FlagFrame>
  );
}

const FLAGS: Record<string, React.ComponentType<FlagProps>> = {
  US: FlagUS,
  GB: FlagGB,
  IN: FlagIN,
  ES: FlagES,
  FR: FlagFR,
  DE: FlagDE,
  SA: FlagSA,
  BR: FlagBR,
  CN: FlagCN,
};

export function FlagByCountryCode({ code, size = 20 }: { code: string; size?: number }) {
  const Flag = FLAGS[code];
  if (!Flag) return null;
  return <Flag size={size} />;
}
