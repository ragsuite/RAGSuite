import React, { useEffect, useId, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const IS_WEB = Platform.OS === 'web';

type Props = {
  label: string;
  tip: string;
  /** Visual weight for the label text. */
  labelWeight?: 'normal' | 'semibold';
};

/**
 * Label + help icon. Tip shows on hover (web) and toggles open on press.
 * Native falls back to Alert on press when hover is unavailable.
 */
export function SetupFieldTip({ label, tip, labelWeight = 'normal' }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<View>(null);
  const tipId = useId();
  const visible = pinned || (IS_WEB && hovered);

  useEffect(() => {
    if (!IS_WEB || !pinned) return;
    const onDocPointer = (event: Event) => {
      const node = rootRef.current as unknown as { contains?: (n: Node | null) => boolean } | null;
      const target = event.target as Node | null;
      if (node?.contains && target && !node.contains(target)) {
        setPinned(false);
        setHovered(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointer, true);
    return () => document.removeEventListener('pointerdown', onDocPointer, true);
  }, [pinned]);

  return (
    <View
      ref={rootRef}
      style={[
        styles.row,
        {
          gap: spacing.xs,
          zIndex: visible ? 40 : 1,
          ...(IS_WEB ? ({ overflow: 'visible' } as object) : null),
        },
      ]}>
      <Text
        style={[
          typography.fieldLabel,
          {
            color: colors.text,
            flexShrink: 1,
            fontWeight: labelWeight === 'semibold' ? '600' : typography.fieldLabel.fontWeight,
          },
        ]}>
        {label}
      </Text>
      <View
        style={[
          styles.tipAnchor,
          IS_WEB ? ({ overflow: 'visible' } as object) : null,
        ]}>
        {visible ? (
          <View
            accessibilityRole="text"
            nativeID={tipId}
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: surfaceRadius.button,
                maxWidth: 280,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              },
            ]}>
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
              {tip}
            </Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tip}
          accessibilityState={{ expanded: visible }}
          hitSlop={10}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          onPress={() => {
            if (!IS_WEB) {
              Alert.alert(label, tip);
              return;
            }
            setPinned((prev) => !prev);
          }}
          style={({ pressed }) => [
            styles.helpHit,
            {
              borderRadius: surfaceRadius.button,
              backgroundColor: pressed || visible ? colors.surfaceMuted : 'transparent',
            },
            IS_WEB ? ({ cursor: 'help' } as object) : null,
          ]}>
          <ActionIcons.help size={15} color={visible ? colors.primary : colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipAnchor: {
    position: 'relative',
    flexShrink: 0,
  },
  helpHit: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    position: 'absolute',
    left: 0,
    top: '100%',
    marginTop: 6,
    borderWidth: 1,
    zIndex: 50,
    elevation: 8,
    ...(IS_WEB
      ? ({
          boxShadow: '0 4px 14px rgba(22, 39, 31, 0.12)',
          minWidth: 200,
          pointerEvents: 'none',
        } as object)
      : null),
  },
});
