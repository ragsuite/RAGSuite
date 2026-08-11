import { Platform } from 'react-native';

import {
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
} from '@/shared/constants/layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

/** Shared web content width + horizontal padding for feature screens. */
export function useFeatureScreenLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = Platform.OS === 'web';

  return {
    width,
    isWeb,
    contentMaxWidth: isWeb ? getFeatureContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getFeatureHorizontalPadding(width) : undefined,
  };
}
