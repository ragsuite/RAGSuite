import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LayoutList, MessageSquare, Settings } from 'lucide-react-native';

import {
  MobileMenuGroup,
  MobileMenuRow,
  MobileMenuSectionLabel,
} from '@/features/chatbot-config/components/ChatbotConfigMobileMenuPrimitives';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { TrainingSubTab } from '@/features/search-config/types/search-config.types';
import { getSearchConfigNav } from '@/features/search-config/utils/search-config-nav';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const TRAINING_ICONS: Record<TrainingSubTab, React.ComponentType<{ size?: number; color?: string }>> = {
  overview: LayoutList,
  'active-config': Settings,
  history: MessageSquare,
};

const TRAINING_ROW_SUBTITLE_KEYS: Record<TrainingSubTab, string> = {
  overview: 'search.training.preview.description',
  'active-config': 'search.training.responseConfig.description',
  history: 'search.history.description',
};

export function SearchConfigTrainingMobileMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useAppTheme();
  const { bundle } = useSearchConfig();
  const { TRAINING_SUB_TABS } = getSearchConfigNav(t);
  const overview = bundle?.trainingOverview;
  const historyCount = bundle?.searchHistory?.length ?? 0;

  const overviewSubtitle = overview
    ? `${overview.searchReady ? t('search.training.activeStatus.active') : t('search.training.activeStatus.inactive')} · ${t('search.training.searchHistory.conversations', { count: historyCount })}`
    : t(TRAINING_ROW_SUBTITLE_KEYS.overview);

  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <MobileMenuSectionLabel>{t('search.training.title')}</MobileMenuSectionLabel>
        <MobileMenuGroup>
          {TRAINING_SUB_TABS.map((tab, index) => {
            const Icon = TRAINING_ICONS[tab.key];
            const isLast = index === TRAINING_SUB_TABS.length - 1;
            const baseSubtitle = tab.key === 'overview' ? overviewSubtitle : t(TRAINING_ROW_SUBTITLE_KEYS[tab.key]);

            return (
              <MobileMenuRow
                key={tab.key}
                title={tab.label}
                subtitle={baseSubtitle}
                icon={Icon}
                isLast={isLast}
                onPress={() => router.push(tab.route)}
                accessibilityHint={`Opens ${tab.label} training section`}
              />
            );
          })}
        </MobileMenuGroup>
      </View>
    </View>
  );
}

