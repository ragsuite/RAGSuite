import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { FeedbackVoteFilter } from "@/features/feedback-moderation/types/feedback-moderation.types";
import { TOUCH_TARGET_MIN } from "@/shared/constants/layout";
import { useTranslation } from "@/i18n";
import {
  AdaptivePopover,
} from "@/shared/components/adaptive/adaptive-popover";
import { AdaptivePickerOptionList } from "@/shared/components/adaptive/adaptive-picker-option-list";
import { AppSelectField } from "@/shared/components/app-select-field";
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
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const { anchorRef, open, anchor: menuAnchor, close, toggle } = usePopoverAnchor();
  const options = useMemo(() => getFeedbackVoteFilterOptions(t), [t]);
  const selectedLabel =
    options.find((o) => o.key === value)?.label ??
    t("feedbackModeration.filter.allVotes");
  const isFiltered = value !== "all";

  if (!iconOnly) {
    return (
      <View style={fullWidth ? styles.fullWidth : triggerWidth != null ? { width: triggerWidth } : undefined}>
        <AppSelectField
          label=""
          variant="inline"
          value={value}
          options={options}
          onChange={onChange}
          accessibilityLabel={t("common.filter")}
          pickerTitle={t("common.filter")}
          controlHeight={controlHeight ?? TOUCH_TARGET_MIN}
          inlineMinWidth={fullWidth ? undefined : triggerWidth}
        />
      </View>
    );
  }

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
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
      </View>

      <AdaptivePopover
        visible={open}
        onClose={close}
        anchor={menuAnchor}
        popoverWidth={MENU_WIDTH}
        lockWidth
        title={t("common.filter")}
        contentStyle={{ padding: spacing.xs }}
      >
        <AdaptivePickerOptionList
          value={value}
          options={options}
          onSelect={(next) => {
            onChange(next);
            close();
          }}
        />
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
});
