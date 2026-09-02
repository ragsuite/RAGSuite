import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Code2, Cpu, FileText, FlaskConical, Globe, LayoutDashboard, Palette, Search, Shield } from 'lucide-react-native';

import {
  MobileMenuGroup,
  MobileMenuRow,
  MobileMenuSectionLabel,
} from '@/features/chatbot-config/components/ChatbotConfigMobileMenuPrimitives';
import type { SettingsSection } from '@/features/search-config/types/search-config.types';
import {
  getSearchConfigNav,
  settingsMenuDisplaySubtitle,
  settingsMenuDisplayTitle,
} from '@/features/search-config/utils/search-config-nav';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

const SECTION_ICONS: Record<SettingsSection, React.ComponentType<{ size?: number; color?: string }>> = {
  overview: LayoutDashboard,
  model: Cpu,
  domains: Globe,
  citation: FileText,
  'search-box': Search,
  privacy: Shield,
  'search-customization': Palette,
  predefined: ActionIcons.help,
  integrations: Code2,
  'search-test': FlaskConical,
};

export function SearchConfigMobileMenu() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const router = useRouter();
  const { MOBILE_SETTINGS_MENU_SECTIONS, SETTINGS_SECTION_META } = getSearchConfigNav(t);

  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <MobileMenuSectionLabel>{t('search.settings.title')}</MobileMenuSectionLabel>
        <MobileMenuGroup>
          {MOBILE_SETTINGS_MENU_SECTIONS.map((section, index) => {
            const meta = SETTINGS_SECTION_META[section];
            const Icon = SECTION_ICONS[section];
            const isLast = index === MOBILE_SETTINGS_MENU_SECTIONS.length - 1;
            if (!meta.route) return null;

            return (
              <MobileMenuRow
                key={section}
                title={settingsMenuDisplayTitle(meta)}
                subtitle={settingsMenuDisplaySubtitle(meta)}
                icon={Icon}
                isLast={isLast}
                accessibilityHint={`Opens ${meta.title}`}
                onPress={() => router.push(meta.route!)}
              />
            );
          })}
        </MobileMenuGroup>
      </View>
    </View>
  );
}
