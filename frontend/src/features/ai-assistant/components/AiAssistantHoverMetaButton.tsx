import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

const IS_WEB = Platform.OS === 'web';

type Props = {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
};

/** Icon action with web hover chip (widget MetaActionButton pattern). */
export function AiAssistantHoverMetaButton({ label, onPress, children }: Props) {
  const { colors, spacing, radius } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const showTooltip = IS_WEB && hovered;

  return (
    <View style={{ position: 'relative' }}>
      {showTooltip ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            alignItems: 'center',
            marginBottom: 6,
            zIndex: 20,
          }}
        >
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              borderRadius: radius.sm,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              ...Platform.select({
                web: { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
                default: {},
              }),
            }}
          >
            <Text
              style={{ color: colors.textMuted, fontSize: 11, fontWeight: '400' }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </View>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed, hovered: webHovered }) => ({
          height: 32,
          width: 32,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed
            ? colors.surfaceMuted
            : hovered || webHovered
              ? colors.surfaceHover
              : 'transparent',
        })}
      >
        {children}
      </Pressable>
    </View>
  );
}
