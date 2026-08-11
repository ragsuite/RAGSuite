import { Check, ChevronDown } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTranslation } from "@/i18n";
import {
  AdaptivePopover,
  type PopoverAnchor,
} from "@/shared/components/adaptive/adaptive-popover";
import { useAppTheme } from "@/shared/hooks/use-app-theme";

type Option<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
  controlHeight?: number;
  triggerWidth?: number;
  fullWidth?: boolean;
};

export function ProjectsDropdownMenu<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
  controlHeight,
  triggerWidth,
  fullWidth,
}: Props<T>) {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius, isWebParitySurfaces, typography } =
    useAppTheme();
  const controlRadius = surfaceRadius.input;
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const selectedLabel =
    options.find((option) => option.key === value)?.label ??
    options[0]?.label ??
    "";
  const menuWidth = Math.max(triggerWidth ?? 176, 176);

  const close = useCallback(() => {
    setOpen(false);
    setMenuAnchor(null);
  }, []);

  const openMenu = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ top: y, left: x, width, height });
      setOpen(true);
    });
  }, []);

  return (
    <>
      <View
        ref={anchorRef}
        collapsable={false}
        style={fullWidth ? styles.fullWidth : undefined}
      >
        <Pressable
          onPress={() => (open ? close() : openMenu())}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [
            styles.trigger,
            fullWidth ? styles.triggerFullWidth : null,
            triggerWidth != null
              ? { width: triggerWidth, minWidth: triggerWidth }
              : null,
            controlHeight != null
              ? { height: controlHeight, minHeight: controlHeight }
              : null,
            {
              borderRadius: controlRadius,
              borderColor: colors.border,
              backgroundColor:
                pressed || open ? colors.surfaceMuted : colors.surface,
              paddingHorizontal: spacing.sm,
            },
          ]}
        >
          <Text
            style={[
              typography.caption,
              styles.triggerLabel,
              { color: colors.text },
            ]}
            numberOfLines={1}
          >
            {selectedLabel}
          </Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      <AdaptivePopover
        visible={open}
        onClose={close}
        anchor={menuAnchor}
        popoverWidth={menuWidth}
        title={accessibilityLabel || t("common.actions")}
        contentStyle={{ padding: spacing.xs }}
      >
        {options.map((option, index) => (
          <Pressable
            key={option.key}
            accessibilityRole="menuitem"
            onPress={() => {
              onChange(option.key);
              close();
            }}
            style={({ pressed }) => [
              styles.option,
              {
                borderRadius: controlRadius,
                backgroundColor: pressed ? colors.surfaceMuted : "transparent",
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs + 2,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              },
            ]}
          >
            {value === option.key ? (
              <Check size={13} color={colors.textMuted} />
            ) : (
              <View style={styles.checkSpacer} />
            )}
            <Text style={[typography.caption, { color: colors.text }]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </AdaptivePopover>
    </>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    width: "100%",
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    minHeight: 40,
    minWidth: 120,
    justifyContent: "space-between",
  },
  triggerFullWidth: {
    width: "100%",
  },
  triggerLabel: {
    flex: 1,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkSpacer: {
    width: 13,
    height: 13,
  },
});
