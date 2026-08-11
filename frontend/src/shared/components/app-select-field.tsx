import { ChevronDown } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AdaptivePickerOptionList } from "@/shared/components/adaptive/adaptive-picker-option-list";
import { AdaptivePopover } from "@/shared/components/adaptive/adaptive-popover";
import {
  AdaptivePickerSheet,
  type PickerOption,
} from "@/shared/components/adaptive/adaptive-picker-sheet";
import { TOUCH_TARGET_MIN } from "@/shared/constants/layout";
import { useCompactLayout } from "@/shared/hooks/use-compact-layout";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import {
  focusRingStyle,
  webFocusBorderStyle,
  webSuppressFocusOutline,
} from "@/shared/utils/focus-ring-style";
import { getFieldPlaceholderColor } from "@/shared/utils/field-placeholder-styles";
import { measurePopoverAnchor } from "@/shared/utils/measure-popover-anchor";

export type SelectOption<T extends string> = PickerOption<T>;

const ANCHORED_MENU_MAX_HEIGHT = 280;

type Props<T extends string> = {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
  accessibilityLabel?: string;
  /** Filter/toolbar style — no label row, full width on compact layouts. */
  variant?: "field" | "inline";
  /** Sheet title when using compact picker; defaults to label or accessibilityLabel. */
  pickerTitle?: string;
  /**
   * `auto` — sheet on compact, anchored menu on wide web.
   * `inline` — same overlays as `auto` (for use inside modals/sheets); avoids in-flow expansion.
   */
  pickerPresentation?: "auto" | "inline";
  /** Shows a checkmark beside the selected option in the menu (reference parity for locale pickers). */
  showSelectedCheckmark?: boolean;
  /** Fixed trigger height for toolbar inline selects (defaults to TOUCH_TARGET_MIN). */
  controlHeight?: number;
};

export function AppSelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
  accessibilityLabel,
  variant = "field",
  pickerTitle,
  pickerPresentation = "auto",
  showSelectedCheckmark = false,
  controlHeight = TOUCH_TARGET_MIN,
}: Props<T>) {
  const { colors, surfaceRadius, typography, spacing } = useAppTheme();
  const isCompactLayout = useCompactLayout();
  const useOverlayPicker =
    pickerPresentation === "auto" || pickerPresentation === "inline";
  const useSheetPicker = useOverlayPicker && isCompactLayout;
  const useWebAnchoredPicker =
    Platform.OS === "web" && useOverlayPicker && !isCompactLayout;
  const [pickerOpen, setPickerOpen] = useState(false);
  const anchorRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const isInline = variant === "inline";
  const placeholderColor = getFieldPlaceholderColor(colors);

  useEffect(() => {
    setPickerOpen(false);
    setMenuAnchor(null);
  }, [useSheetPicker, useWebAnchoredPicker, isCompactLayout]);

  const closeAnchoredPicker = useCallback(() => {
    setPickerOpen(false);
    setMenuAnchor(null);
  }, []);

  const openAnchoredPicker = useCallback(() => {
    measurePopoverAnchor(anchorRef.current, (anchor) => {
      setMenuAnchor(anchor);
      setPickerOpen(true);
    });
  }, []);

  const selectedOption = options.find((option) => option.key === value);
  const selectedLabel = selectedOption?.label ?? placeholder ?? "Select";
  const hasValue = Boolean(selectedOption);

  const resolvedA11yLabel = accessibilityLabel ?? label;
  const resolvedPickerTitle = pickerTitle ?? (label || resolvedA11yLabel);

  const resolvedControlHeight =
    isInline && (useSheetPicker || useWebAnchoredPicker)
      ? controlHeight
      : undefined;

  const fieldBorderColor = error ? colors.danger : colors.borderStrong;
  const triggerStyle = [
    styles.input,
    isInline && styles.inputInline,
    {
      borderColor: fieldBorderColor,
      borderRadius: surfaceRadius.input,
      backgroundColor: isInline ? colors.surface : colors.surfaceMuted,
      minHeight:
        resolvedControlHeight ??
        (useSheetPicker || useWebAnchoredPicker ? TOUCH_TARGET_MIN : 50),
      ...(resolvedControlHeight ? { height: resolvedControlHeight } : null),
    },
  ];

  const triggerContent = (
    <>
      <Text
        style={[
          typography.fieldInput,
          { color: hasValue ? colors.text : placeholderColor, flex: 1 },
        ]}
        numberOfLines={1}
      >
        {selectedLabel}
      </Text>
      <ChevronDown size={16} color={colors.textMuted} />
    </>
  );

  const triggerPressable = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resolvedA11yLabel}
      accessibilityHint="Opens option list"
      accessibilityState={{ expanded: pickerOpen }}
      onPress={() => {
        if (useWebAnchoredPicker) {
          if (pickerOpen) closeAnchoredPicker();
          else openAnchoredPicker();
          return;
        }
        if (useSheetPicker) setPickerOpen(true);
      }}
      style={({ pressed, focused, hovered }) => [
        triggerStyle,
        styles.triggerPressable,
        pressed || hovered ? { backgroundColor: colors.surfaceMuted } : null,
        webFocusBorderStyle(focused, colors.primary, fieldBorderColor),
        focusRingStyle(focused, colors.primary),
        webSuppressFocusOutline(),
      ]}
    >
      {triggerContent}
    </Pressable>
  );

  return (
    <View
      style={[styles.root, isInline && styles.rootInline, { gap: spacing.xxs }]}
    >
      {!isInline && label ? (
        <Text style={[typography.fieldLabel, { color: colors.text }]}>
          {label}
        </Text>
      ) : null}

      {useSheetPicker ? (
        <>
          {triggerPressable}
          {pickerOpen ? (
            <AdaptivePickerSheet
              visible={pickerOpen}
              title={resolvedPickerTitle}
              value={value}
              options={options}
              onSelect={onChange}
              onClose={() => setPickerOpen(false)}
              indicatorPosition={showSelectedCheckmark ? "left" : "right"}
            />
          ) : null}
        </>
      ) : useWebAnchoredPicker ? (
        <>
          <View
            ref={anchorRef}
            collapsable={false}
            style={isInline ? styles.rootInline : styles.anchorWrap}
          >
            {triggerPressable}
          </View>
          <AdaptivePopover
            visible={pickerOpen}
            onClose={closeAnchoredPicker}
            anchor={menuAnchor}
            popoverWidth={Math.max(menuAnchor?.width ?? 200, 200)}
            maxHeight={ANCHORED_MENU_MAX_HEIGHT}
            title={resolvedPickerTitle}
            accessibilityLabel={resolvedPickerTitle}
          >
            <AdaptivePickerOptionList
              value={value}
              options={options}
              onSelect={onChange}
              onAfterSelect={closeAnchoredPicker}
              indicatorPosition={showSelectedCheckmark ? "left" : "right"}
            />
          </AdaptivePopover>
        </>
      ) : null}

      {error ? (
        <Text style={[typography.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
  },
  rootInline: {
    minWidth: 140,
    flex: Platform.OS === "web" ? 0 : undefined,
  },
  anchorWrap: {
    width: "100%",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inputInline: {
    backgroundColor: "transparent",
  },
  triggerPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
