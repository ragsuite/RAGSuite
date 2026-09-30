import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdaptivePopover, type PopoverAnchor } from '@/shared/components/adaptive/adaptive-popover';
import { ActionIcons } from '@/shared/constants/action-icons';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type ExportFormat = 'csv' | 'json';

export type ExportFormatMenuLabels = {
  /** Button accessibility label, labeled-button text, and popover title. */
  menu: string;
  csv: string;
  json: string;
  /** Accessibility label for a format row; receives the row label. */
  formatA11y: (formatLabel: string) => string;
};

export type ExportFormatMenuProps = {
  labels: ExportFormatMenuLabels;
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
  exporting?: boolean;
  /** Web toolbar alignment (defaults to touch target on mobile). */
  controlHeight?: number;
  /** Show labeled Export button instead of icon-only. */
  showLabel?: boolean;
};

const MENU_WIDTH = 112;

/** Download icon (or labeled button) that opens a CSV / JSON picker. */
export function ExportFormatMenu({
  labels,
  onExport,
  disabled = false,
  exporting = false,
  controlHeight,
  showLabel = false,
}: ExportFormatMenuProps) {
  const iconSize = controlHeight ?? TOUCH_TARGET_MIN;
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const inactive = disabled || exporting;

  const options: { format: ExportFormat; label: string }[] = [
    { format: 'csv', label: labels.csv },
    { format: 'json', label: labels.json },
  ];

  const close = useCallback(() => {
    setOpen(false);
    setMenuAnchor(null);
  }, []);

  const openMenu = useCallback(() => {
    if (inactive) return;

    const measure = () => {
      anchorRef.current?.measureInWindow((x, y, width, height) => {
        setMenuAnchor({ top: y, left: x, width, height });
        setOpen(true);
      });
    };

    if (Platform.OS === 'android') {
      requestAnimationFrame(measure);
      return;
    }
    measure();
  }, [inactive]);

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

  const foreground = disabled ? colors.textMuted : colors.text;

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={styles.anchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.menu}
          accessibilityState={{ expanded: open, disabled: inactive, busy: exporting }}
          disabled={inactive}
          onPress={onToggle}
          style={({ pressed }) => [
            showLabel ? styles.labeledBtn : styles.iconBtn,
            {
              height: iconSize,
              borderRadius: surfaceRadius.button,
              borderColor: colors.border,
              backgroundColor: pressed || open ? colors.surfaceMuted : colors.surface,
              opacity: inactive ? 0.45 : 1,
              paddingHorizontal: showLabel ? spacing.md : 0,
              minWidth: showLabel ? undefined : iconSize,
              width: showLabel ? undefined : iconSize,
            },
          ]}>
          {exporting ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <ActionIcons.download size={16} color={foreground} />
          )}
          {showLabel ? (
            <Text style={[typography.body, styles.labelText, { color: foreground }]}>{labels.menu}</Text>
          ) : null}
        </Pressable>
      </View>

      <AdaptivePopover
        visible={open && !exporting}
        onClose={close}
        anchor={menuAnchor}
        popoverWidth={MENU_WIDTH}
        title={labels.menu}>
        {options.map((option, index) => (
          <Pressable
            key={option.format}
            accessibilityRole="menuitem"
            accessibilityLabel={labels.formatA11y(option.label)}
            onPress={() => onSelect(option.format)}
            style={({ pressed }) => [
              {
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              },
            ]}>
            <Text style={[typography.body, styles.labelText, { color: colors.text }]}>{option.label}</Text>
          </Pressable>
        ))}
      </AdaptivePopover>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  labeledBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
    gap: 8,
  },
  labelText: {
    fontWeight: '500',
  },
});
