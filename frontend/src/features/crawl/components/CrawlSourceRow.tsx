import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Clock } from "lucide-react-native";

import { CrawlStatusBadge } from "@/features/crawl/components/CrawlStatusBadge";
import { CrawlEmbeddingCoverageWarningIcon } from "@/features/crawl/components/CrawlEmbeddingCoverageWarningIcon";
import type {
  CrawlEmbeddingTargetOptions,
  CrawlMenuAnchor,
  CrawlSource,
} from "@/features/crawl/types/crawl.types";
import type { ItemEmbeddingCoverageEntry } from "@/features/search-config/types/embedding.types";
import { CRAWL_SOURCE_TABLE } from "@/features/crawl/utils/crawl-layout";
import {
  CRAWL_MOBILE_TOUCH_MIN,
  useCrawlCompactLayout,
} from "@/features/crawl/utils/crawl-mobile";
import {
  displaySourceStatus,
  formatRelativeTime,
  formatShortDate,
  getSourceStatusTone,
  shouldShowCrawlProgress,
  sourceIsTrained,
} from "@/features/crawl/utils/crawl.utils";
import { resolveCrawlSourceModelLabels } from "@/features/crawl/utils/crawl-embedding-display";
import { useTranslation } from "@/i18n";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { ActionIcons } from "@/shared/constants/action-icons";

type Props = {
  source: CrawlSource;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
  layout?: "card" | "table";
  isLast?: boolean;
  modelLabels?: string[];
  showCoverageWarning?: boolean;
  onOpenMenu: (anchor?: CrawlMenuAnchor) => void;
  onPress?: () => void;
};

export function CrawlSourceRow({
  source,
  coverageEntry,
  embeddingOptions,
  layout = "card",
  isLast,
  modelLabels: modelLabelsProp,
  showCoverageWarning = true,
  onOpenMenu,
  onPress,
}: Props) {
  const { t, locale } = useTranslation();
  const { colors, spacing, surfaceRadius, componentRadius, typography } =
    useAppTheme();
  const controlRadius = surfaceRadius.button;
  const isCompact = useCrawlCompactLayout();
  const menuAnchorRef = useRef<View>(null);
  const isTable = layout === "table" && !isCompact;
  const statusLabel = displaySourceStatus(source, t);
  const statusTone = getSourceStatusTone(source);
  const showProgress = shouldShowCrawlProgress(source);
  const progressValue = Math.max(
    0,
    Math.min(100, Math.round(source.progress_percentage ?? 0)),
  );
  const trained = sourceIsTrained(source);
  const modelLabels =
    modelLabelsProp ??
    resolveCrawlSourceModelLabels(source, coverageEntry, embeddingOptions);
  const modelFallback = trained
    ? t("crawl.table.model.unknown")
    : t("crawl.table.model.pending");

  const modelLabelStack = (
    <View style={styles.modelLabelStack}>
      {modelLabels.length > 0 ? (
        modelLabels.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            style={[
              typography.caption,
              { color: colors.text, fontWeight: "500", textAlign: "center" },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ))
      ) : (
        <Text
          style={[
            typography.caption,
            { color: colors.text, fontWeight: "500", textAlign: "center" },
          ]}
          numberOfLines={1}
        >
          {modelFallback}
        </Text>
      )}
    </View>
  );

  const urlCell = (
    <View style={[styles.main, styles.urlCell]}>
      <View style={styles.nameRow}>
        <Text
          style={[
            typography.body,
            { color: colors.text, fontWeight: "500", flex: 1 },
          ]}
          numberOfLines={1}
        >
          {source.name || t("crawl.table.unnamed")}
        </Text>
        {showCoverageWarning ? (
          <CrawlEmbeddingCoverageWarningIcon
            source={source}
            entry={coverageEntry}
            embeddingOptions={embeddingOptions}
          />
        ) : null}
      </View>
      <Text
        style={[typography.caption, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {source.base_url || t("crawl.table.noUrl")}
      </Text>
    </View>
  );

  const modelCell = <View style={styles.modelCell}>{modelLabelStack}</View>;

  const menuButton = (
    <View ref={menuAnchorRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${source.name}`}
        accessibilityHint="Opens start crawl, edit, and delete options"
        hitSlop={8}
        onPress={(event) => {
          event?.stopPropagation?.();
          menuAnchorRef.current?.measureInWindow((left, top, width, height) => {
            onOpenMenu({ top, left, width, height });
          });
        }}
        style={({ pressed, hovered }) => [
          styles.menuButton,
          isTable && styles.menuTable,
          {
            width: isTable ? CRAWL_SOURCE_TABLE.actionWidth : 32,
            height: isTable ? CRAWL_MOBILE_TOUCH_MIN : 32,
            borderRadius: controlRadius,
            backgroundColor:
              pressed || hovered ? colors.surfaceMuted : "transparent",
          },
        ]}
      >
        <ActionIcons.more size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  if (isTable) {
    return (
      <View
        style={[
          styles.tableRow,
          {
            borderBottomColor: colors.border,
            borderBottomWidth: isLast ? 0 : 1,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            gap: CRAWL_SOURCE_TABLE.rowGap,
            backgroundColor: colors.surface,
          },
        ]}
      >
        {onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${source.name}, ${statusLabel}`}
            accessibilityHint="Opens source details"
            onPress={onPress}
            style={({ pressed, hovered }) => [
              styles.tableMain,
              {
                backgroundColor: pressed ? colors.surfaceMuted : "transparent",
              },
            ]}
          >
            {urlCell}
            {modelCell}
            <Metric value={String(source.depth)} style={styles.depthCell} />
            <Metric value={source.cadence} preserveCase style={styles.cadenceCell} />
            <View style={styles.headlessCell}>
              <HeadlessBadge value={source.headless_mode || "AUTO"} />
            </View>
            <View style={styles.statusCell}>
              <View style={styles.statusStack}>
                <CrawlStatusBadge
                  label={statusLabel}
                  tone={statusTone}
                  preserveCase
                />
                {showProgress ? (
                  <View style={styles.progressRow}>
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: colors.surfaceMuted },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${progressValue}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[typography.caption, { color: colors.textMuted }]}
                    >
                      {progressValue}%
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.trainingCell}>
              {trained ? (
                <View style={styles.trainedStack}>
                  <View style={styles.trainedRow}>
                    <CheckCircle2 size={14} color={colors.success} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.success, fontWeight: "500" },
                      ]}
                    >
                      {t("crawl.table.training.trained")}
                    </Text>
                  </View>
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {formatShortDate(source.trained_at, locale)}
                  </Text>
                </View>
              ) : (
                <View style={styles.trainedRow}>
                  <Clock size={14} color={colors.warning} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.textMuted, fontWeight: "500" },
                    ]}
                  >
                    {t("crawl.table.training.pending")}
                  </Text>
                </View>
              )}
            </View>
            <Metric
              value={formatRelativeTime(source.last_crawl_at, t)}
              style={styles.lastCrawlCell}
            />
            <Metric
              value={String(source.documents_count)}
              align="center"
              style={styles.linksCell}
            />
          </Pressable>
        ) : (
          <View style={styles.tableMain}>
            {urlCell}
            {modelCell}
            <Metric value={String(source.depth)} style={styles.depthCell} />
            <Metric value={source.cadence} preserveCase style={styles.cadenceCell} />
            <View style={styles.headlessCell}>
              <HeadlessBadge value={source.headless_mode || "AUTO"} />
            </View>
            <View style={styles.statusCell}>
              <CrawlStatusBadge
                label={statusLabel}
                tone={statusTone}
                preserveCase
              />
            </View>
            <View style={styles.trainingCell}>
              {trained ? (
                <View style={styles.trainedRow}>
                  <CheckCircle2 size={14} color={colors.success} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.success, fontWeight: "500" },
                    ]}
                  >
                    {t("crawl.table.training.trained")}
                  </Text>
                </View>
              ) : (
                <View style={styles.trainedRow}>
                  <Clock size={14} color={colors.warning} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.textMuted, fontWeight: "500" },
                    ]}
                  >
                    {t("crawl.table.training.pending")}
                  </Text>
                </View>
              )}
            </View>
            <Metric
              value={formatRelativeTime(source.last_crawl_at, t)}
              style={styles.lastCrawlCell}
            />
            <Metric
              value={String(source.documents_count)}
              align="center"
              style={styles.linksCell}
            />
          </View>
        )}
        {menuButton}
      </View>
    );
  }

  const cardContent = (
    <View style={styles.mobileBody}>
      <View style={styles.mobileTopRow}>
        <View style={styles.mobileIdentity}>
          <View style={styles.nameRow}>
            <Text
              style={[
                typography.body,
                { color: colors.text, flex: 1, lineHeight: 20 },
              ]}
              numberOfLines={1}
            >
              {source.name || t("crawl.table.unnamed")}
            </Text>
            {showCoverageWarning ? (
              <CrawlEmbeddingCoverageWarningIcon
                source={source}
                entry={coverageEntry}
                embeddingOptions={embeddingOptions}
              />
            ) : null}
          </View>
          <Text
            style={[
              typography.caption,
              { color: colors.textMuted, lineHeight: 16 },
            ]}
            numberOfLines={1}
          >
            {source.base_url || t("crawl.table.noUrl")}
          </Text>
        </View>
        <CrawlStatusBadge label={statusLabel} tone={statusTone} preserveCase />
      </View>

      {showProgress ? (
        <View style={styles.progressRow}>
          <View
            style={[
              styles.progressTrack,
              styles.progressTrackMobile,
              { backgroundColor: colors.surfaceMuted },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${progressValue}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <Text
            style={[
              typography.caption,
              { color: colors.textMuted, fontWeight: "500" },
            ]}
          >
            {progressValue}%
          </Text>
        </View>
      ) : null}

      <View style={styles.mobileMetaRow}>
        <Text
          style={[typography.caption, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          Depth {source.depth} · {source.cadence} · Headless{" "}
          {source.headless_mode || "AUTO"}
        </Text>
      </View>
      <View style={styles.mobileMetaRow}>
        {trained ? (
          <View style={styles.trainedRow}>
            <CheckCircle2 size={13} color={colors.success} />
            <Text
              style={[
                typography.caption,
                { color: colors.success, fontWeight: "500" },
              ]}
            >
              {t("crawl.table.training.trained")}{" "}
              {formatShortDate(source.trained_at, locale)}
            </Text>
          </View>
        ) : (
          <View style={styles.trainedRow}>
            <Clock size={13} color={colors.warning} />
            <Text
              style={[
                typography.caption,
                { color: colors.textMuted, fontWeight: "500" },
              ]}
            >
              {t("crawl.table.training.pending")}
            </Text>
          </View>
        )}
        <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
        <Text
          style={[
            typography.caption,
            { color: colors.textMuted, flexShrink: 1 },
          ]}
          numberOfLines={1}
        >
          {formatRelativeTime(source.last_crawl_at, t)}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
        <View style={styles.mobileModelStack}>{modelLabelStack}</View>
        <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
        <Text
          style={[
            typography.caption,
            { color: colors.text, fontWeight: "500" },
          ]}
        >
          {source.documents_count} links
        </Text>
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.cardRow,
        {
          borderColor: colors.border,
          borderRadius: componentRadius.card,
          backgroundColor: colors.surface,
          paddingVertical: 6,
          paddingLeft: spacing.sm,
          paddingRight: spacing.xs,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 4,
        },
      ]}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${source.name}, ${statusLabel}`}
          accessibilityHint="Opens source details to edit"
          onPress={onPress}
          style={({ pressed, hovered }) => [
            styles.mobileMain,
            {
              backgroundColor: pressed ? colors.surfaceMuted : "transparent",
              borderRadius: surfaceRadius.card,
            },
          ]}
        >
          {cardContent}
        </Pressable>
      ) : (
        <View style={styles.mobileMain}>{cardContent}</View>
      )}
      {menuButton}
    </View>
  );
}

function Metric({
  value,
  preserveCase,
  align = 'left',
  style,
}: {
  value: string;
  preserveCase?: boolean;
  align?: 'left' | 'center';
  style?: object;
}) {
  const { colors, typography } = useAppTheme();
  return (
    <View
      style={[
        styles.metric,
        align === 'center' ? styles.metricCentered : null,
        style,
      ]}
      accessibilityLabel={value}>
      <Text
        style={[
          typography.caption,
          {
            color: colors.text,
            fontWeight: preserveCase ? '600' : '500',
            textAlign: align,
          },
          preserveCase ? styles.preserveCase : null,
        ]}
        numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function HeadlessBadge({ value }: { value: string }) {
  const { colors, surfaceRadius, typography } = useAppTheme();
  return (
    <View
      style={[
        styles.headlessBadge,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.button,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Text
        style={[
          typography.caption,
          styles.preserveCase,
          { color: colors.textMuted },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tableMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: CRAWL_SOURCE_TABLE.rowGap,
    minWidth: 0,
  },
  cardRow: {
    borderWidth: 1,
  },
  mobileMain: {
    flex: 1,
    minWidth: 0,
  },
  mobileBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  mobileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mobileIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mobileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  main: {
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  urlCell: {
    flex: CRAWL_SOURCE_TABLE.urlFlex,
    minWidth: CRAWL_SOURCE_TABLE.urlMinWidth,
    flexShrink: 1,
    gap: 2,
  },
  modelCell: {
    flex: CRAWL_SOURCE_TABLE.modelFlex,
    minWidth: CRAWL_SOURCE_TABLE.modelMinWidth,
    flexShrink: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modelLabelStack: {
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileModelStack: {
    flexShrink: 1,
    maxWidth: "100%",
  },
  metric: {
    justifyContent: "center",
    flexShrink: 0,
  },
  depthCell: {
    width: CRAWL_SOURCE_TABLE.depthWidth,
    flexShrink: 0,
  },
  cadenceCell: {
    width: CRAWL_SOURCE_TABLE.cadenceWidth,
    flexShrink: 0,
  },
  headlessCell: {
    width: CRAWL_SOURCE_TABLE.headlessWidth,
    justifyContent: "center",
    flexShrink: 0,
  },
  statusCell: {
    width: CRAWL_SOURCE_TABLE.statusWidth,
    justifyContent: "center",
    flexShrink: 0,
  },
  trainingCell: {
    flex: CRAWL_SOURCE_TABLE.trainingFlex,
    minWidth: CRAWL_SOURCE_TABLE.trainingMinWidth,
    flexShrink: 1,
    justifyContent: "center",
  },
  lastCrawlCell: {
    flex: CRAWL_SOURCE_TABLE.lastCrawlFlex,
    minWidth: CRAWL_SOURCE_TABLE.lastCrawlMinWidth,
    flexShrink: 1,
  },
  linksCell: {
    width: CRAWL_SOURCE_TABLE.linksWidth,
    flexShrink: 0,
  },
  metricCentered: {
    alignItems: "center",
  },
  statusStack: {
    gap: 6,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    minWidth: 56,
    maxWidth: 80,
  },
  progressTrackMobile: {
    maxWidth: undefined,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  trainedStack: {
    gap: 2,
  },
  trainedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  headlessBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  preserveCase: {
    textTransform: "none",
  },
  menuButton: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuTable: {
    alignSelf: "center",
  },
});
