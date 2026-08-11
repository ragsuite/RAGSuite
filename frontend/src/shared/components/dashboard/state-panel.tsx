import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

import { AppButton } from "@/shared/components/app-button";
import { EmptyStateView } from "@/shared/components/dashboard/empty-state-view";
import { useTranslation } from "@/i18n";
import { useAppTheme } from "@/shared/hooks/use-app-theme";

type Props = {
  loading?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyLabel?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  children: React.ReactNode;
};

function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message === "errors.network.noResponse" ||
    message.includes("errors.network.") ||
    lower.includes("no response from server") ||
    lower.includes("network") ||
    lower.includes("internet connection") ||
    lower.includes("econnrefused") ||
    lower.includes("failed to fetch")
  );
}

export function StatePanel({
  loading,
  error,
  isEmpty,
  emptyLabel,
  emptyDescription,
  onRetry,
  children,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { paddingVertical: spacing.lg, gap: spacing.xs },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t("common.loading")}
        </Text>
      </View>
    );
  }

  if (error) {
    const network = isNetworkErrorMessage(error);
    const title = network
      ? t("errors.network.unavailable.title")
      : t("errors.server.title");
    const body = network
      ? t("errors.network.unavailable.description")
      : error.startsWith("errors.")
        ? t(error)
        : error;

    return (
      <View
        style={[
          styles.center,
          {
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.md,
            gap: spacing.sm,
          },
        ]}
      >
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: colors.dangerBackground,
              borderRadius: surfaceRadius.button,
            },
          ]}
        >
          <AlertTriangle size={22} color={colors.danger} strokeWidth={2} />
        </View>
        <Text
          style={[
            typography.subtitle,
            { color: colors.text, textAlign: "center" },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.textMuted, textAlign: "center", lineHeight: 22 },
          ]}
        >
          {body}
        </Text>
        {onRetry ? (
          <View style={styles.actionWrap}>
            <AppButton
              label={
                network
                  ? t("errors.network.unavailable.cta.retry")
                  : t("common.retry")
              }
              onPress={onRetry}
              size="compact"
              variant="outline"
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (isEmpty) {
    return (
      <EmptyStateView
        title={emptyLabel ?? t("analytics.empty.noData")}
        description={emptyDescription}
        variant="panel"
      >
        {children}
      </EmptyStateView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  actionWrap: {
    alignSelf: "center",
    marginTop: 4,
  },
});
