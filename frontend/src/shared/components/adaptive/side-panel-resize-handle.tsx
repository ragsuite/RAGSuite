import React from 'react';
import { Platform, View } from 'react-native';

import { SIDE_PANEL_RESIZE_HIT_WIDTH } from '@/shared/components/adaptive/use-side-panel-resize';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  enabled: boolean;
  resizing: boolean;
  onStart: (clientX: number) => void;
};

export function SidePanelResizeHandle({ enabled, resizing, onStart }: Props) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  if (Platform.OS !== 'web' || !enabled) return null;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={t('overlay.resizePanel')}
      // @ts-expect-error web mouse drag
      onMouseDown={(event: { clientX: number; preventDefault?: () => void }) => {
        event.preventDefault?.();
        onStart(event.clientX);
      }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: SIDE_PANEL_RESIZE_HIT_WIDTH,
        zIndex: 5,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'col-resize' as never,
      }}>
      <View
        style={{
          width: 3,
          height: '100%',
          maxHeight: 64,
          borderRadius: 2,
          backgroundColor: resizing ? colors.primary : colors.borderStrong,
        }}
      />
    </View>
  );
}
