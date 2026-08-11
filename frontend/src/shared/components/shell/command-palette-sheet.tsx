import { useRouter } from 'expo-router';
import { Activity, FileText, KeyRound, MessageSquare, Settings, Users, Zap, type LucideIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { getDrawerNavSections, hrefForAppRoute } from '@/config/navigation';
import { useSession } from '@/features/auth/providers/session-provider';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useUserProfileSummary } from '@/features/profile/hooks/useUserProfileSummary';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';
import { NavGroupLabel } from '@/shared/components/brand';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { AppFlatList } from '@/shared/components/app-flat-list';
import { AppTextField } from '@/shared/components/app-text-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type CommandItem = {
  id: string;
  group: 'navigation' | 'actions';
  title: string;
  description?: string;
  icon: LucideIcon;
  keywords: string[];
  onSelect: () => void;
};

type ListRow =
  | { type: 'heading'; id: string; title: string }
  | { type: 'command'; id: string; command: CommandItem };

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function CommandPaletteSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const resultsMaxHeight = Math.round(windowHeight * 0.42);
  const { session } = useSession();
  const { profile } = useUserProfileSummary();
  const { canAccess: canAccessOrgAdmin, enterpriseModulesAvailable } = useOrgAdminAccess();
  const { canAccessRoute } = useActiveProject();
  const isOrgAdminUser =
    Boolean(session?.user.isAdmin) || profile?.user.role === 'Admin';

  const commands = useMemo<CommandItem[]>(() => {
    const navFromDrawer = getDrawerNavSections(Platform.OS === 'web', {
      isOrgAdmin: isOrgAdminUser && canAccessOrgAdmin,
      enterpriseModulesAvailable,
      canAccessRoute,
    }).flatMap((section) =>
      section.items.map((item) => ({
        id: `nav-${item.route}`,
        group: 'navigation' as const,
        title: item.enterpriseLocked ? `${t(item.labelKey)} · Enterprise` : t(item.labelKey),
        icon: item.icon,
        keywords: [item.route, t(item.labelKey), ...(item.enterpriseLocked ? ['enterprise', 'lock'] : [])],
        onSelect: () => router.push(hrefForAppRoute(item.route)),
      })),
    );

    const extraNav: CommandItem[] = [
      {
        id: 'nav-profile',
        group: 'navigation',
        title: t('commandPalette.nav.profile.title'),
        description: t('commandPalette.nav.profile.description'),
        icon: Users,
        keywords: ['profile', 'account'],
        onSelect: () => router.push(hrefForAppRoute('profile')),
      },
      {
        id: 'nav-settings',
        group: 'navigation',
        title: t('commandPalette.nav.settings.title'),
        description: t('commandPalette.nav.settings.description'),
        icon: Settings,
        keywords: ['settings'],
        onSelect: () => router.push(hrefForAppRoute('settings')),
      },
      {
        id: 'nav-configuration',
        group: 'navigation',
        title: t('commandPalette.nav.configuration.title'),
        description: t('commandPalette.nav.configuration.description'),
        icon: KeyRound,
        keywords: ['configuration', 'api keys'],
        onSelect: () => router.push(hrefForAppRoute('configuration')),
      },
      {
        id: 'nav-history',
        group: 'navigation',
        title: t('commandPalette.nav.history.title'),
        description: t('commandPalette.nav.history.description'),
        icon: MessageSquare,
        keywords: ['history', 'chat'],
        onSelect: () => router.push(hrefForAppRoute('history')),
      },
      {
        id: 'nav-compare-models',
        group: 'navigation',
        title: t('commandPalette.nav.compareModels.title'),
        description: t('commandPalette.nav.compareModels.description'),
        icon: Zap,
        keywords: ['compare', 'models'],
        onSelect: () => router.push(hrefForAppRoute('compare-models')),
      },
      {
        id: 'nav-system-health',
        group: 'navigation',
        title: t('commandPalette.nav.systemHealth.title'),
        description: t('commandPalette.nav.systemHealth.description'),
        icon: Activity,
        keywords: ['health', 'system'],
        onSelect: () => router.push(hrefForAppRoute('system-health')),
      },
    ];

    const actions: CommandItem[] = [
      {
        id: 'create-source',
        group: 'actions',
        title: t('commandPalette.actions.createSource.title'),
        description: t('commandPalette.actions.createSource.description'),
        icon: ActionIcons.add,
        keywords: ['create', 'source', 'crawl'],
        onSelect: () => router.push('/(app)/(tabs)/crawl-management?segment=domain'),
      },
      {
        id: 'upload-document',
        group: 'actions',
        title: t('commandPalette.actions.uploadDocuments.title'),
        description: t('commandPalette.actions.uploadDocuments.description'),
        icon: FileText,
        keywords: ['upload', 'document'],
        onSelect: () => router.push('/(app)/(tabs)/crawl-management?segment=document'),
      },
    ];

    const seen = new Set<string>();
    return [...navFromDrawer, ...extraNav, ...actions].filter((cmd) => {
      if (seen.has(cmd.id)) return false;
      seen.add(cmd.id);
      return true;
    });
  }, [canAccessOrgAdmin, canAccessRoute, enterpriseModulesAvailable, isOrgAdminUser, router, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [commands, query]);

  const listRows = useMemo<ListRow[]>(() => {
    const navigationItems = filtered.filter((c) => c.group === 'navigation');
    const actionItems = filtered.filter((c) => c.group === 'actions');
    const rows: ListRow[] = [];
    if (navigationItems.length) {
      rows.push({ type: 'heading', id: 'heading-nav', title: t('commandPalette.groups.navigation') });
      for (const command of navigationItems) {
        rows.push({ type: 'command', id: command.id, command });
      }
    }
    if (actionItems.length) {
      rows.push({ type: 'heading', id: 'heading-actions', title: t('commandPalette.groups.actions') });
      for (const command of actionItems) {
        rows.push({ type: 'command', id: command.id, command });
      }
    }
    return rows;
  }, [filtered, t]);

  const handleSelect = (cmd: CommandItem) => {
    cmd.onSelect();
    setQuery('');
    onClose();
  };

  return (
    <AdaptiveOverlay
      visible={visible}
      title={t('common.search')}
      subtitle={Platform.OS === 'web' ? t('commandPalette.shortcutHint') : undefined}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      maxWidth={560}
      presentation="dialog"
      scrollable={false}
      flushBody>
      <View style={[styles.body, { gap: spacing.sm, paddingHorizontal: spacing.md }]}>
        <AppTextField
          label=""
          accessibilityLabel={t('common.search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('commandPalette.input.placeholder')}
          autoFocus={visible}
          returnKeyType="search"
          blurOnSubmit={false}
        />
        {listRows.length === 0 ? (
          <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
            {t('commandPalette.empty')}
          </Text>
        ) : (
          <AppFlatList
            data={listRows}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            nestedScrollEnabled
            scrollbarVariant="overlay"
            style={{ maxHeight: resultsMaxHeight, marginHorizontal: -spacing.md }}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}
            renderItem={({ item }) => {
              if (item.type === 'heading') {
                return (
                  <NavGroupLabel style={{ marginTop: spacing.xs, marginBottom: spacing.xxs, color: colors.textMuted }}>
                    {item.title}
                  </NavGroupLabel>
                );
              }
              const cmd = item.command;
              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleSelect(cmd)}
                  style={({ pressed }) => [
                    styles.commandRow,
                    {
                      borderRadius: surfaceRadius.input,
                      backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.sm,
                    },
                  ]}>
                  <View style={styles.commandIcon}>
                    <cmd.icon size={18} color={colors.textMuted} />
                  </View>
                  <View style={styles.commandCopy}>
                    <Text
                      style={[
                        typography.body,
                        styles.commandTitle,
                        { color: colors.text },
                      ]}>
                      {cmd.title}
                    </Text>
                    {cmd.description ? (
                      <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
                        {cmd.description}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    minHeight: 0,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  commandIcon: {
    width: 20,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  commandTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
  },
  commandCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
