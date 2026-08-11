import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  AppCard,
  AppCardContent,
  AppCardDescription,
  AppCardHeader,
} from "@/shared/components/surfaces/app-card";
import { useAppTheme } from "@/shared/hooks/use-app-theme";

type Props = {
  title?: string;
  subtitle?: string;
  subtitleAsCaption?: boolean;
  titleLeading?: React.ReactNode;
  titleRight?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/** @deprecated Prefer AppCard composition; kept as thin wrapper for existing callers. */
export function SectionCard({
  title,
  subtitle,
  subtitleAsCaption = false,
  titleLeading,
  titleRight,
  children,
  style,
  contentStyle,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();

  return (
    <AppCard style={style}>
      {title ? (
        <AppCardHeader compact>
          <View style={[styles.titleRow, { gap: spacing.sm }]}>
            {titleLeading ? (
              <View style={styles.shrink}>{titleLeading}</View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text
                accessibilityRole="header"
                style={[typography.chartCardTitle, { color: colors.text }]}>
                {title}
              </Text>
            </View>
            {titleRight ? (
              <View style={styles.shrink}>{titleRight}</View>
            ) : null}
          </View>
          {subtitle ? (
            subtitleAsCaption ? (
              <AppCardDescription>{subtitle}</AppCardDescription>
            ) : (
              <SectionBodySubtitle>{subtitle}</SectionBodySubtitle>
            )
          ) : null}
        </AppCardHeader>
      ) : null}
      <AppCardContent flushTop={Boolean(title)} compact style={contentStyle}>
        {children}
      </AppCardContent>
    </AppCard>
  );
}

function SectionBodySubtitle({ children }: { children: string }) {
  const { colors, typography } = useAppTheme();
  return (
    <Text style={[typography.body, { color: colors.textMuted }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  shrink: {
    flexShrink: 0,
  },
});
