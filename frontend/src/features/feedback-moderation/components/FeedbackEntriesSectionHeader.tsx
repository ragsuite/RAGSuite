import React from "react";
import { StyleSheet, View } from "react-native";

import { useTranslation } from "@/i18n";
import { PageSectionHeader } from "@/shared/components/surfaces/page-section-header";
import { useAppTheme } from "@/shared/hooks/use-app-theme";

export function FeedbackEntriesSectionHeader({
  banded = false,
}: {
  banded?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, spacing, isWebParitySurfaces } = useAppTheme();
  const showBand = banded && isWebParitySurfaces;

  return (
    <View
      style={
        showBand
          ? {
              backgroundColor: colors.surfaceMuted,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }
          : undefined
      }
    >
      <PageSectionHeader
        variant="list"
        title={t("feedbackModeration.table.title")}
        subtitle={t("feedbackModeration.table.subtitle")}
        style={{ marginTop: 0, marginBottom: 0 }}
      />
    </View>
  );
}
