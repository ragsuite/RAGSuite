import type { LucideIcon } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppCardDescription,
  AppCardTitle,
} from "@/shared/components/surfaces/app-card";
import { useAppTheme } from "@/shared/hooks/use-app-theme";

type Props = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  meta?: string;
  trailing?: React.ReactNode;
};

/** Icon + title + subtitle header shared by Domain, Document, and connector tabs. */
export function CrawlTabPanelHeader({
  icon: Icon,
  title,
  subtitle,
  meta,
  trailing,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View style={[styles.root, { gap: spacing.sm }]}>
      <View style={[styles.leading, { gap: spacing.sm, flex: 1, minWidth: 0 }]}>
        <View
          style={[
            styles.iconWrap,
            {
              borderRadius: surfaceRadius.button,
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
            },
          ]}
        >
          <Icon size={18} color={colors.primary} />
        </View>
        <View style={[styles.copy, { gap: 2, flex: 1, minWidth: 0 }]}>
          <AppCardTitle>{title}</AppCardTitle>
          <AppCardDescription>{subtitle}</AppCardDescription>
          {meta ? (
            <Text
              style={[
                typography.caption,
                { color: colors.textMuted, lineHeight: 18 },
              ]}
            >
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  leading: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    minWidth: 0,
  },
  trailing: {
    flexShrink: 0,
    alignSelf: "center",
  },
});
