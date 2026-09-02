import React from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Code2, Cpu, Globe, LayoutDashboard, Palette, Search, Shield, ThumbsUp } from 'lucide-react-native';

import {
  MobileMenuGroup,
  MobileMenuRow,
  MobileMenuSectionLabel,
} from '@/features/chatbot-config/components/ChatbotConfigMobileMenuPrimitives';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { SettingsSection } from '@/features/chatbot-config/types/chatbot-config.types';
import { getChatbotConfigNav, settingsMenuDisplayTitle } from '@/features/chatbot-config/utils/chatbot-config-nav';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const SECTION_ICONS: Record<SettingsSection, React.ComponentType<{ size?: number; color?: string }>> = {
  overview: LayoutDashboard,
  model: Cpu,
  'widget-config': Search,
  'widget-customization': Palette,
  domains: Globe,
  privacy: Shield,
  feedback: ThumbsUp,
  integrations: Code2,
  'web-integration': Code2,
  'mobile-integration': Code2,
};

export function ChatbotConfigMobileMenu() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const router = useRouter();
  const { bundle } = useChatbotConfig();
  const { MOBILE_SETTINGS_MENU_SECTIONS, SETTINGS_SECTION_META } = getChatbotConfigNav(t);
  const menuSections: SettingsSection[] = ['overview', ...MOBILE_SETTINGS_MENU_SECTIONS];
  const overview = bundle?.settingsOverview;

  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <MobileMenuSectionLabel>{t('chatbot.settings.configuration')}</MobileMenuSectionLabel>
        <MobileMenuGroup>
          {menuSections.map((section, index) => {
            const meta = SETTINGS_SECTION_META[section];
            const Icon = SECTION_ICONS[section];
            const isLast = index === menuSections.length - 1;
            if (!meta.route) return null;

            const subtitle =
              section === 'overview' && overview
                ? `${overview.modelLabel} · ${overview.domainCount} ${overview.domainCount === 1 ? 'domain' : 'domains'}`
                : meta.subtitle;

            return (
              <MobileMenuRow
                key={section}
                title={settingsMenuDisplayTitle(meta)}
                subtitle={subtitle}
                icon={Icon}
                isLast={isLast}
                onPress={() => router.push(meta.route! as Href)}
              />
            );
          })}
        </MobileMenuGroup>
      </View>
    </View>
  );
}
