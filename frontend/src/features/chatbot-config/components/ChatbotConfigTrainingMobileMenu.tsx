import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LayoutList, MessageSquare, Settings } from 'lucide-react-native';

import {
  MobileMenuGroup,
  MobileMenuRow,
  MobileMenuSectionLabel,
} from '@/features/chatbot-config/components/ChatbotConfigMobileMenuPrimitives';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { TrainingSubTab } from '@/features/chatbot-config/types/chatbot-config.types';
import { getChatbotConfigNav } from '@/features/chatbot-config/utils/chatbot-config-nav';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const TRAINING_ICONS: Record<TrainingSubTab, React.ComponentType<{ size?: number; color?: string }>> = {
  overview: LayoutList,
  'active-config': Settings,
  history: MessageSquare,
};

const TRAINING_ROW_SUBTITLE_KEYS: Record<TrainingSubTab, string> = {
  overview: 'chatbot.training.preview.description',
  'active-config': 'chatbot.training.activeStatus.title',
  history: 'chatbot.history.description',
};

export function ChatbotConfigTrainingMobileMenu() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const router = useRouter();
  const { bundle } = useChatbotConfig();
  const { TRAINING_SUB_TABS } = getChatbotConfigNav(t);
  const overview = bundle?.trainingOverview;
  const stats = bundle?.trainingStats;

  const overviewSubtitle =
    overview && stats
      ? `${stats.chatbotActive ? t('chatbot.training.activeStatus.active') : t('chatbot.training.activeStatus.inactive')} · ${t('chatbot.training.chatHistory.conversations', { count: stats.conversationCount })} · ${overview.indexedDocuments} indexed`
      : t(TRAINING_ROW_SUBTITLE_KEYS.overview);

  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <MobileMenuSectionLabel>{t('chatbot.training.title')}</MobileMenuSectionLabel>
        <MobileMenuGroup>
          {TRAINING_SUB_TABS.map((tab, index) => {
            const Icon = TRAINING_ICONS[tab.key];
            const isLast = index === TRAINING_SUB_TABS.length - 1;
            if (!tab.route) return null;

            const subtitle = tab.key === 'overview' ? overviewSubtitle : t(TRAINING_ROW_SUBTITLE_KEYS[tab.key]);

            return (
              <MobileMenuRow
                key={tab.key}
                title={tab.label}
                subtitle={subtitle}
                icon={Icon}
                isLast={isLast}
                onPress={() => router.push(tab.route!)}
              />
            );
          })}
        </MobileMenuGroup>
      </View>
    </View>
  );
}
