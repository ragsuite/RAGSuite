import { Platform } from 'react-native';

/** Minimal brand elevation — prefer hairline borders over shadows (AGENTS.md). */
const nativeRaisedShadow = {
  shadowColor: '#1B1A17',
  shadowOpacity: 0.06,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
} as const;

const webRaisedShadow = {
  boxShadow: '0 10px 30px rgba(27, 26, 23, 0.06)',
} as const;

export const elevation = {
  /** Resting cards/panels — border only; no shadow. */
  card: {},
  /** Floating menus, popovers, toasts. */
  raised: Platform.OS === 'web' ? webRaisedShadow : nativeRaisedShadow,
} as const;
