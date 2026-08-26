import { Check, LayoutGrid } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import type { Project } from '@/features/projects/types/projects.types';
import { useTranslation } from '@/i18n';
import { usePopoverLayout } from '@/shared/components/adaptive/adaptive-popover';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  projects: Project[];
  activeProjectId: string | null;
  loading?: boolean;
  onSelectProject: (project: Project) => void;
  onManageProjects: () => void;
};

/** Approx. max height of one project row (padding + title + optional 2-line description). */
const ITEM_ROW_MAX = 68;
const LIST_MAX_ROWS = 3;
const THREE_ROW_CAP = LIST_MAX_ROWS * ITEM_ROW_MAX;
/** Space reserved for View All Projects + gap so the footer never clips inside the popover. */
const FOOTER_RESERVE = 56;

export function ProjectSwitcherPanel({ projects, activeProjectId, loading, onSelectProject, onManageProjects }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const popoverLayout = usePopoverLayout();
  const listMaxHeight =
    popoverLayout?.maxHeight != null
      ? Math.min(THREE_ROW_CAP, Math.max(0, popoverLayout.maxHeight - FOOTER_RESERVE))
      : THREE_ROW_CAP;

  if (loading && projects.length === 0) {
    return (
      <View style={[styles.loadingWrap, { paddingVertical: spacing.lg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <AppScrollView
        keyboardShouldPersistTaps="handled"
        scrollbarVariant="overlay"
        style={{ maxHeight: listMaxHeight }}
        contentContainerStyle={{ gap: spacing.xxs }}>
        {projects.length === 0 ? (
          <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md }]}>
            {t('projects.empty.default')}
          </Text>
        ) : (
          projects.map((project) => {
            const isActive = project.id === activeProjectId || project.isActive;
            return (
              <Pressable
                key={project.id}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${project.name}`}
                accessibilityState={{ selected: isActive }}
                onPress={() => onSelectProject(project)}
                style={({ pressed, hovered }) => [
                  styles.item,
                  {
                    borderRadius: surfaceRadius.button,
                    backgroundColor: isActive
                      ? colors.primaryTint
                      : pressed
                        ? colors.surfaceMuted
                        : hovered
                          ? colors.surfaceHover
                          : 'transparent',
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                  },
                ]}>
                <View style={styles.itemContent}>
                  <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
                    {project.name}
                  </Text>
                  {project.description ? (
                    <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]} numberOfLines={2}>
                      {project.description}
                    </Text>
                  ) : null}
                </View>
                {isActive ? <Check size={16} color={colors.primary} /> : <View style={styles.checkSpacer} />}
              </Pressable>
            );
          })
        )}
      </AppScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('projects.dropdown.viewAll')}
        onPress={onManageProjects}
        style={({ pressed, hovered }) => [
          styles.manageBtn,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.button,
            backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.sm,
            gap: spacing.xs,
          },
        ]}>
        <LayoutGrid size={16} color={colors.textMuted} />
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{t('projects.dropdown.viewAll')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  checkSpacer: {
    width: 16,
    height: 16,
  },
  manageBtn: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
