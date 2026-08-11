import { Platform, type ViewStyle } from 'react-native';

type NativeShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

type WebShadowStyle = Pick<ViewStyle, 'boxShadow'>;

/** Applies native shadow* on iOS/Android and boxShadow on web to avoid RN Web deprecations. */
export function platformShadow(native: NativeShadowStyle, web: WebShadowStyle): ViewStyle {
  return Platform.OS === 'web' ? web : native;
}
