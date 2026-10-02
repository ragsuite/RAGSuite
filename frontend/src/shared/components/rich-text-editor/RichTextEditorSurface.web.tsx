import React, { Suspense } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RichTextEditorDomProps } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Loaded on demand so TipTap stays out of the initial web bundle. */
const RichTextEditorDom = React.lazy(() => import('@/shared/components/rich-text-editor/dom/RichTextEditorDom'));

const TOOLBAR_PLACEHOLDER_HEIGHT = 88;

function EditorPlaceholder({ minHeight }: { minHeight: number }) {
  const { colors, surfaceRadius } = useAppTheme();
  return (
    <View
      accessibilityElementsHidden
      style={[
        styles.placeholder,
        {
          minHeight: minHeight + TOOLBAR_PLACEHOLDER_HEIGHT,
          borderColor: colors.borderStrong,
          borderRadius: surfaceRadius.input,
          backgroundColor: colors.surface,
        },
      ]}>
      <View style={[styles.toolbar, { backgroundColor: colors.surfaceMuted, borderBottomColor: colors.border }]} />
    </View>
  );
}

export function RichTextEditorSurface(props: RichTextEditorDomProps) {
  return (
    <Suspense fallback={<EditorPlaceholder minHeight={props.minHeight} />}>
      <RichTextEditorDom {...props} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  toolbar: {
    height: TOOLBAR_PLACEHOLDER_HEIGHT,
    borderBottomWidth: 1,
  },
});
