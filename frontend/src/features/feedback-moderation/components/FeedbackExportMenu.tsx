import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { TOUCH_TARGET_MIN } from "@/shared/constants/layout";
import { useTranslation } from "@/i18n";
import {
  AdaptivePopover,
  type PopoverAnchor,
} from "@/shared/components/adaptive/adaptive-popover";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { ActionIcons } from "@/shared/constants/action-icons";

type ExportFormat = "csv" | "json";

type Props = {
  disabled?: boolean;
  exporting?: boolean;
  onExport: (format: ExportFormat) => void;
  /** Web toolbar alignment (defaults to touch target on mobile). */
  controlHeight?: number;
  /** Show labeled Export button instead of icon-only. */
  showLabel?: boolean;
};

const EXPORT_OPTIONS = (
  t: (key: string) => string,
): { format: ExportFormat; label: string }[] => [
  { format: "csv", label: t("feedbackModeration.exportCsv") },
  { format: "json", label: t("feedbackModeration.exportJson") },
];

const MENU_WIDTH = 112;

export function FeedbackExportMenu({
  disabled = false,
  exporting = false,
  onExport,
  controlHeight,
  showLabel = false,
}: Props) {
  const iconSize = controlHeight ?? TOUCH_TARGET_MIN;
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuAnchor(null);
  }, []);

  const positionMenu = useCallback(
    (x: number, y: number, width: number, height: number) => {
      setMenuAnchor({ top: y, left: x, width, height });
      setOpen(true);
    },
    [],
  );

  const openMenu = useCallback(() => {
    if (disabled || exporting) return;

    const measure = () => {
      anchorRef.current?.measureInWindow((x, y, width, height) => {
        positionMenu(x, y, width, height);
      });
    };

    if (Platform.OS === "android") {
      requestAnimationFrame(measure);
      return;
    }

    measure();
  }, [disabled, exporting, positionMenu]);

  const onToggle = () => {
    if (open) {
      close();
      return;
    }
    openMenu();
  };

  const onSelect = (format: ExportFormat) => {
    close();
    onExport(format);
  };

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={styles.anchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("feedbackModeration.export")}
          accessibilityState={{ expanded: open }}
          disabled={disabled || exporting}
          onPress={onToggle}
          style={({ pressed }) => [
            showLabel ? styles.labeledBtn : styles.iconBtn,
            {
              height: iconSize,
              borderRadius: surfaceRadius.button,
              borderColor: colors.border,
              backgroundColor:
                pressed || open ? colors.surfaceMuted : colors.surface,
              opacity: disabled || exporting ? 0.45 : 1,
              paddingHorizontal: showLabel ? spacing.md : 0,
              minWidth: showLabel ? undefined : iconSize,
              width: showLabel ? undefined : iconSize,
            },
          ]}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <ActionIcons.download
              size={16}
              color={disabled ? colors.textMuted : colors.text}
            />
          )}
          {showLabel ? (
            <Text
              style={[
                typography.body,
                {
                  color: disabled ? colors.textMuted : colors.text,
                  fontWeight: "500",
                },
              ]}
            >
              {t("feedbackModeration.export")}
            </Text>
          ) : null}
        </Pressable>
      </View>

      <AdaptivePopover
        visible={open && !exporting}
        onClose={close}
        anchor={menuAnchor}
        popoverWidth={MENU_WIDTH}
        title={t("feedbackModeration.export")}
      >
        {EXPORT_OPTIONS(t).map((option, index) => (
          <Pressable
            key={option.format}
            accessibilityRole="menuitem"
            accessibilityLabel={`${t("feedbackModeration.export")} ${option.label}`}
            onPress={() => onSelect(option.format)}
            style={({ pressed }) => [
              styles.menuItem,
              {
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                typography.body,
                { color: colors.text, fontWeight: "500" },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </AdaptivePopover>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "relative",
  },
  iconBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  labeledBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
    gap: 8,
  },
  menuItem: {},
});
