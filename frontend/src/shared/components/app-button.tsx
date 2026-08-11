import type { LucideIcon } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { TOOLBAR_CONTROL_HEIGHT } from "@/shared/constants/layout";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import {
  focusRingStyle,
  webSuppressFocusOutline,
} from "@/shared/utils/focus-ring-style";

export type AppButtonVariant =
  | "cta"
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";
export type AppButtonSize = "default" | "compact" | "dense";

type Props = {
  label: string;
  /** Overrides `label` for accessibility when visible text differs. */
  accessibilityLabel?: string;
  nativeID?: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  size?: AppButtonSize;
  fullWidth?: boolean;
  /** @deprecated Spacing should come from parent `gap`. Kept for API compatibility. */
  noTopMargin?: boolean;
  /**
   * `cta` — bright pine hero (one per region).
   * `primary` — darker pine filled action.
   * `secondary` — muted fill.
   * `outline` / `ghost` / `danger` — as named.
   */
  variant?: AppButtonVariant;
  icon?: LucideIcon;
  /** Square control; `label` is used only for accessibility. */
  iconOnly?: boolean;
  /** Outline/ghost: use primary color for label + icon. */
  accent?: boolean;
};

/** Shared control height so primary + outline buttons align in the same row. */
export const APP_BUTTON_COMPACT_HEIGHT = TOOLBAR_CONTROL_HEIGHT;
export const APP_BUTTON_DEFAULT_HEIGHT = 48;
export const APP_BUTTON_DENSE_HEIGHT = 40;

function resolveHeight(size: AppButtonSize): number {
  if (size === "dense") return APP_BUTTON_DENSE_HEIGHT;
  if (size === "compact") return APP_BUTTON_COMPACT_HEIGHT;
  return APP_BUTTON_DEFAULT_HEIGHT;
}

export function AppButton({
  label,
  accessibilityLabel,
  nativeID,
  disabled,
  loading,
  onPress,
  // Product standard height is compact (44). Auth/onboarding pass size="default" (48).
  size = "compact",
  fullWidth,
  noTopMargin: _noTopMargin,
  // Default `cta` preserves prior filled-bright look for existing call sites.
  // Use `primary` explicitly for darker pine; set `cta` on the one hero action per region.
  variant = "cta",
  icon: Icon,
  iconOnly = false,
  accent = false,
}: Props) {
  const { colors, surfaceRadius, typography } = useAppTheme();
  const isDisabled = Boolean(disabled || loading);
  const buttonHeight = resolveHeight(size);
  const isCta = variant === "cta";
  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
  const isOutline = variant === "outline";
  const isGhost = variant === "ghost";
  const isDanger = variant === "danger";
  const isFilled = isCta || isPrimary || isDanger;
  const a11yLabel = accessibilityLabel ?? label;

  const labelColor = isFilled
    ? colors.textOnPrimary
    : accent || isGhost
      ? colors.primary
      : colors.text;

  const iconColor = isFilled
    ? colors.textOnPrimary
    : accent || isGhost
      ? colors.primary
      : colors.textMuted;

  const borderColor = isGhost
    ? "transparent"
    : isCta
      ? isDisabled
        ? colors.border
        : colors.primary
      : isPrimary
        ? isDisabled
          ? colors.border
          : colors.primaryPressed
        : isDanger
          ? isDisabled
            ? colors.border
            : colors.danger
          : colors.border;

  const spinnerColor = isFilled ? colors.textOnPrimary : colors.primary;
  const horizontalPad = iconOnly ? 0 : size === "default" ? 16 : 12;
  const iconSize = size === "dense" ? 16 : 16;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      nativeID={nativeID}
      disabled={isDisabled}
      onPress={onPress}
      style={(state) => {
        const pressed = state.pressed;
        const focused = Boolean((state as { focused?: boolean }).focused);
        const hovered = Boolean((state as { hovered?: boolean }).hovered);
        let backgroundColor: string = "transparent";
        if (isCta) {
          backgroundColor = pressed
            ? colors.pineDeep
            : hovered
              ? colors.primaryPressed
              : colors.primary;
        } else if (isPrimary) {
          backgroundColor =
            pressed || hovered ? colors.pineDeep : colors.primaryPressed;
        } else if (isDanger) {
          backgroundColor = colors.danger;
        } else if (isSecondary) {
          backgroundColor =
            pressed || hovered ? colors.border : colors.surfaceMuted;
        } else if (isOutline) {
          backgroundColor =
            pressed || hovered ? colors.surfaceMuted : colors.surface;
        } else if (isGhost) {
          backgroundColor =
            pressed || hovered ? colors.surfaceMuted : "transparent";
        }

        return [
          styles.base,
          fullWidth ? styles.fullWidth : !iconOnly ? styles.inline : null,
          iconOnly ? styles.iconOnly : null,
          {
            borderRadius: surfaceRadius.button,
            backgroundColor,
            opacity: isDisabled ? 0.58 : isDanger && pressed ? 0.9 : 1,
            minWidth:
              iconOnly || fullWidth
                ? undefined
                : size === "compact" || size === "dense"
                  ? 118
                  : undefined,
            width: iconOnly ? buttonHeight : undefined,
            paddingHorizontal: horizontalPad,
            height: buttonHeight,
            borderWidth: 1,
            borderColor,
          },
          focusRingStyle(focused, colors.primary),
          webSuppressFocusOutline(),
        ];
      }}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View style={styles.content}>
          {Icon ? <Icon size={iconSize} color={iconColor} /> : null}
          {iconOnly ? null : (
            <Text
              style={[
                typography.body,
                {
                  color: labelColor,
                  fontWeight: "500",
                  fontSize: size === "default" ? typography.body.fontSize : 14,
                  textAlign: fullWidth ? "center" : undefined,
                  flexShrink: 1,
                },
              ]}
              numberOfLines={fullWidth ? 2 : 1}
            >
              {label}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    maxWidth: "100%",
  },
  iconOnly: {
    minWidth: undefined,
    paddingHorizontal: 0,
  },
  inline: {
    alignSelf: "flex-start",
  },
  fullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
});
