import { Check, ChevronDown } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FeedbackVoteFilter } from "@/features/feedback-moderation/types/feedback-moderation.types";
import { TOUCH_TARGET_MIN } from "@/shared/constants/layout";
import { useTranslation } from "@/i18n";
import {
  AdaptivePopover,
} from "@/shared/components/adaptive/adaptive-popover";
import { usePopoverAnchor } from "@/shared/hooks/use-popover-anchor";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { ActionIcons } from "@/shared/constants/action-icons";

const MENU_WIDTH = 176;

type Props = {
  value: FeedbackVoteFilter;
  onChange: (value: FeedbackVoteFilter) => void;
  fullWidth?: boolean;
  iconOnly?: boolean;
  controlHeight?: number;
  triggerWidth?: number;
};

function getFeedbackVoteFilterOptions(t: (key: string) => string) {
  return [
    { key: "all" as const, label: t("feedbackModeration.filter.allVotes") },
    {
      key: "positive" as const,
      label: t("feedbackModeration.filter.positive"),
    },
    {
      key: "negative" as const,
      label: t("feedbackModeration.filter.negative"),
    },
  ];
}

export function FeedbackVoteFilterMenu({
  value,
  onChange,
  fullWidth,
  iconOnly,
  controlHeight,
  triggerWidth,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const { anchorRef, open, anchor: menuAnchor, close, toggle } = usePopoverAnchor();
  const options = useMemo(() => getFeedbackVoteFilterOptions(t), [t]);
  const selectedLabel =
    options.find((o) => o.key === value)?.label ??
    t("feedbackModeration.filter.allVotes");
  const isFiltered = value !== "all";

  const trigger = iconOnly ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isFiltered
          ? `${t("common.filter")}: ${selectedLabel}`
          : t("common.filter")
      }
      accessibilityState={{ expanded: open }}
      onPress={toggle}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          borderRadius: surfaceRadius.button,
          borderColor: isFiltered ? colors.primary : colors.border,
          backgroundColor:
            pressed || open ? colors.surfaceMuted : colors.surface,
        },
      ]}
    >
      <ActionIcons.filter
        size={18}
        color={isFiltered ? colors.primary : colors.text}
      />
    </Pressable>
  ) : (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={t("common.filter")}
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
          borderRadius: surfaceRadius.button,
          borderColor: isFiltered ? colors.primary : colors.border,
          backgroundColor:
            pressed || open ? colors.surfaceMuted : colors.surface,
          paddingHorizontal: spacing.sm,
        },
      ]}
    >
      <Text
        style={[
          typography.body,
          styles.triggerLabel,
          { color: colors.text, fontSize: 14 },
        ]}
      >
        {selectedLabel}
      </Text>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <>
      <View
        ref={anchorRef}
        collapsable={false}
        style={fullWidth && !iconOnly ? styles.fullWidth : undefined}
      >
        {trigger}
      </View>

      <AdaptivePopover
        visible={open}
        onClose={close}
        anchor={menuAnchor}
        popoverWidth={MENU_WIDTH}
        title={t("common.filter")}
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
                borderRadius: surfaceRadius.button,
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
  iconBtn: {
    width: TOUCH_TARGET_MIN,
    height: TOUCH_TARGET_MIN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
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
