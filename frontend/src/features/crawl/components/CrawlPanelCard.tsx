import React from "react";
import { StyleSheet, View } from "react-native";

import {
  AppCard,
  AppCardContent,
  AppCardDescription,
  AppCardHeader,
  AppCardTitle,
} from "@/shared/components/surfaces/app-card";
import { useCrawlLayout } from "@/features/crawl/hooks/useCrawlLayout";
import { isCrawlMobileLayout } from "@/features/crawl/utils/crawl-mobile";
import { useAppTheme } from "@/shared/hooks/use-app-theme";

type Props = {
  title: string;
  subtitle?: string;
  titleLeading?: React.ReactNode;
  headerAction?: React.ReactNode;
  /** Keep header action beside title/subtitle even when the layout would otherwise stack. */
  inlineHeaderAction?: boolean;
  children: React.ReactNode;
};

export function CrawlPanelCard({
  title,
  subtitle,
  titleLeading,
  headerAction,
  inlineHeaderAction = false,
  children,
}: Props) {
  const { spacing } = useAppTheme();
  const { isHeaderStacked } = useCrawlLayout();
  const isMobile = isCrawlMobileLayout();
  const stackedHeader = isHeaderStacked && headerAction && !inlineHeaderAction;

  const headerPad = isMobile
    ? {
        paddingHorizontal: spacing.sm,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
      }
    : { paddingBottom: spacing.xs };

  const contentPad = isMobile
    ? {
        paddingHorizontal: spacing.sm,
        paddingBottom: spacing.sm,
        paddingTop: 0,
      }
    : undefined;

  return (
    <AppCard>
      <AppCardHeader compact style={headerPad}>
        {stackedHeader ? (
          <>
            <AppCardTitle>{title}</AppCardTitle>
            {subtitle ? (
              <AppCardDescription>{subtitle}</AppCardDescription>
            ) : null}
            <View style={styles.headerActionStacked}>{headerAction}</View>
          </>
        ) : (
          <View style={[styles.headerTop, { gap: spacing.sm }]}>
            <View style={[styles.copyColumn, { gap: spacing.xxs, flex: 1 }]}>
              <View style={[styles.titleRow, { gap: spacing.xs }]}>
                <AppCardTitle>{title}</AppCardTitle>
                {titleLeading ? (
                  <View style={styles.shrink}>{titleLeading}</View>
                ) : null}
              </View>
              {subtitle ? (
                <AppCardDescription>{subtitle}</AppCardDescription>
              ) : null}
            </View>
            {headerAction ? (
              <View style={styles.headerAction}>{headerAction}</View>
            ) : null}
          </View>
        )}
      </AppCardHeader>
      <AppCardContent flushTop compact style={contentPad}>
        {children}
      </AppCardContent>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  copyColumn: {
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    minWidth: 0,
  },
  shrink: {
    flexShrink: 0,
  },
  headerAction: {
    flexShrink: 0,
    alignSelf: "center",
  },
  headerActionStacked: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
});
