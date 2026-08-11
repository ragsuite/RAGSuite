/**
 * Ambient shims for React Native Web APIs that Expo's RN types omit.
 * Keeps host/CI typecheck aligned without rewriting every call site.
 */
import 'react-native';

declare module 'react-native' {
  interface PressableStateCallbackType {
    /** Web: keyboard / programmatic focus */
    focused?: boolean;
    /** Web: pointer hover */
    hovered?: boolean;
  }

  interface ViewStyle {
    outlineStyle?: 'solid' | 'dotted' | 'dashed' | 'none';
    outlineWidth?: number;
    outlineColor?: string;
    outlineOffset?: number;
    position?: 'absolute' | 'relative' | 'static' | 'sticky' | 'fixed';
    transition?: string;
    boxShadow?: string;
    /** Web scrolling affordances used in StyleSheet web branches */
    overflowY?: 'visible' | 'hidden' | 'scroll' | 'auto';
    overflowX?: 'visible' | 'hidden' | 'scroll' | 'auto';
    WebkitOverflowScrolling?: 'auto' | 'touch';
  }

  interface TextStyle {
    outlineStyle?: 'solid' | 'dotted' | 'dashed' | 'none';
    outlineWidth?: number;
    outlineColor?: string;
    outlineOffset?: number;
    resize?: 'none' | 'both' | 'horizontal' | 'vertical' | string;
  }

  interface ImageStyle {
    overflow?: 'visible' | 'hidden' | 'scroll';
  }
}
