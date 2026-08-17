import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

const IS_WEB = Platform.OS === 'web';

type ActionChrome = {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
};

function resolveActionChrome(
  colors: ReturnType<typeof useAppTheme>['colors'],
  {
    pressed,
    hovered,
    selected,
    disabled,
  }: {
    pressed: boolean;
    hovered: boolean;
    selected: boolean;
    disabled?: boolean;
  },
): ActionChrome {
  if (disabled && !selected) {
    return {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      iconColor: colors.textMuted,
    };
  }
  if (selected) {
    return {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      iconColor: colors.textOnPrimary,
    };
  }
  if (pressed || hovered) {
    return {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.ochre,
      iconColor: colors.ochre,
    };
  }
  return {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    iconColor: colors.textMuted,
  };
}

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  /** Avoid clipping when the control sits on the leading edge of a card. */
  tooltipAlign?: 'start' | 'center';
  children: (iconColor: string) => React.ReactNode;
};

export function SearchWidgetActionButton({
  label,
  onPress,
  disabled = false,
  selected = false,
  tooltipAlign = 'center',
  children,
}: Props) {
  const { colors } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const showTooltip = IS_WEB && hovered && !disabled;

  return (
    <View style={styles.actionBtnWrap}>
      {showTooltip ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.actionTooltip,
            tooltipAlign === 'start' ? styles.actionTooltipStart : styles.actionTooltipCenter,
            {
              backgroundColor: colors.surface,
              borderColor: colors.ochre,
            },
          ]}>
          <Text style={[styles.actionTooltipText, { color: colors.text }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed, hovered: webHovered }) => {
          const chrome = resolveActionChrome(colors, {
            pressed: Boolean(pressed),
            hovered: hovered || Boolean(webHovered),
            selected,
            disabled,
          });
          return [
            styles.actionBtn,
            {
              borderColor: chrome.borderColor,
              backgroundColor: chrome.backgroundColor,
              opacity: disabled && !selected ? 0.45 : 1,
              ...(IS_WEB
                ? ({
                    cursor: disabled ? 'default' : 'pointer',
                    transitionProperty: 'background-color, border-color, opacity',
                    transitionDuration: '150ms',
                  } as object)
                : null),
            },
          ];
        }}>
        {({ pressed, hovered: webHovered }) => {
          const chrome = resolveActionChrome(colors, {
            pressed: Boolean(pressed),
            hovered: hovered || Boolean(webHovered),
            selected,
            disabled,
          });
          return children(chrome.iconColor);
        }}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBtnWrap: {
    position: 'relative',
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
  actionTooltip: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    zIndex: 30,
    ...(IS_WEB
      ? ({
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.12)',
        } as object)
      : null),
  },
  actionTooltipStart: {
    left: 0,
  },
  actionTooltipCenter: {
    left: '50%',
    ...(IS_WEB ? ({ transform: 'translateX(-50%)' } as object) : { transform: [{ translateX: -40 }] }),
  },
  actionTooltipText: {
    fontSize: 11,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
