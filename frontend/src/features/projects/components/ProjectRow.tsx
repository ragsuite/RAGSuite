import { Calendar, Check, FolderOpen } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Project } from '@/features/projects/types/projects.types';
import { formatProjectCreatedDate } from '@/features/projects/utils/projects-display';
import { useProjectsLayout } from '@/features/projects/utils/projects-layout';
import { useTranslation } from '@/i18n';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  project: Project;
  onPress: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
};

export function ProjectRow({ project, onPress, onEdit, onDelete }: Props) {
  const { t, locale } = useTranslation();
  const { colors, spacing, typography, elevation, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const { useCardLayout, isNativeMobile } = useProjectsLayout();
  const isActive = project.isActive;
  const actionSize = isNativeMobile ? 40 : TOUCH_TARGET_MIN;

  const rowShellStyle = useCardLayout
    ? [
        styles.card,
        elevation.card,
        {
          borderColor: isActive ? colors.primary : colors.border,
          borderRadius: panelRadius,
          backgroundColor: isActive ? colors.primaryTint : colors.surface,
          borderLeftColor: isActive ? colors.primary : colors.border,
          borderLeftWidth: isActive ? 4 : 1,
          padding: spacing.sm,
        },
      ]
    : [
        styles.row,
        {
          borderBottomColor: colors.border,
          backgroundColor: isActive ? colors.primaryTint : colors.surface,
          borderLeftColor: isActive ? colors.primary : 'transparent',
          borderLeftWidth: isActive ? 4 : 0,
          paddingRight: spacing.md,
          paddingVertical: spacing.sm,
        },
      ];

  return (
    <View style={rowShellStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${project.name}${isActive ? ', active project' : ''}`}
        accessibilityState={{ disabled: isActive }}
        disabled={isActive}
        onPress={() => onPress(project)}
        style={({ pressed, hovered }) => [
          useCardLayout ? styles.cardBody : styles.lead,
          {
            gap: spacing.sm,
            paddingLeft: useCardLayout ? 0 : spacing.md,
            backgroundColor: !isActive ? (pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent') : 'transparent',
          },
        ]}>
        <View
          style={[
            styles.iconWrap,
            {
              width: useCardLayout ? 40 : 36,
              height: useCardLayout ? 40 : 36,
              borderColor: colors.border,
              borderRadius: surfaceRadius.button,
              backgroundColor: isActive ? colors.primaryTint : colors.surfaceMuted,
            },
          ]}>
          <FolderOpen size={18} color={isActive ? colors.primary : colors.textMuted} />
        </View>

        <View style={styles.content}>
          <Text
            style={[
              typography.body,
              { color: colors.text, fontSize: useCardLayout ? 16 : undefined },
            ]}
            numberOfLines={1}>
            {project.name}
          </Text>
          {project.description ? (
            <Text
              style={[typography.caption, { color: colors.textMuted, lineHeight: 20, marginTop: 2 }]}
              numberOfLines={useCardLayout ? 3 : 2}>
              {project.description}
            </Text>
          ) : null}
          <View style={[styles.metaRow, { marginTop: spacing.xxs }]}>
            <Calendar size={13} color={colors.textMuted} />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t('projects.list.created', {
                date: formatProjectCreatedDate(project.createdAt, t, locale),
              })}
            </Text>
          </View>
        </View>
      </Pressable>

      <View
        style={[
          useCardLayout ? styles.cardActions : styles.actions,
          { gap: spacing.xs, marginTop: useCardLayout ? spacing.xs : 0 },
        ]}>
        {isActive ? (
          <View
            accessibilityLabel="Active project"
            style={[
              styles.actionBtn,
              {
                width: actionSize,
                height: actionSize,
                borderRadius: surfaceRadius.button,
                backgroundColor: colors.primaryTint,
              },
            ]}>
            <Check size={18} color={colors.primary} />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${project.name}`}
          onPress={() => onEdit(project)}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              width: actionSize,
              height: actionSize,
              borderRadius: surfaceRadius.button,
              borderColor: colors.border,
              borderWidth: 1,
              backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
            },
          ]}>
          <ActionIcons.edit size={16} color={colors.textMuted} />
        </Pressable>

        {!isActive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${project.name}`}
            onPress={() => onDelete(project)}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                width: actionSize,
                height: actionSize,
                borderRadius: surfaceRadius.button,
                borderColor: colors.danger,
                borderWidth: 1,
                backgroundColor: pressed ? colors.dangerBackground : colors.surface,
              },
            ]}>
            <ActionIcons.delete size={16} color={colors.danger} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  card: {
    width: '100%',
    borderWidth: 1,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  lead: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
