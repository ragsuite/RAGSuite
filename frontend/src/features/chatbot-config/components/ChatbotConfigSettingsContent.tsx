import React from 'react';

import { AllowedDomainsPanel } from '@/features/chatbot-config/components/settings/AllowedDomainsPanel';
import { ChatWidgetConfigPanel } from '@/features/chatbot-config/components/settings/ChatWidgetConfigPanel';
import { ChatWidgetCustomizationPanel } from '@/features/chatbot-config/components/settings/ChatWidgetCustomizationPanel';
import { FeedbackSettingsPanel } from '@/features/chatbot-config/components/settings/FeedbackSettingsPanel';
import { PrivacySettingsPanel } from '@/features/chatbot-config/components/settings/PrivacySettingsPanel';
import { IntegrationsScriptsPanel } from '@/features/chatbot-config/components/settings/IntegrationsScriptsPanel';
import { ModelSettingsPanel } from '@/features/chatbot-config/components/settings/ModelSettingsPanel';
import { SettingsOverviewPanel } from '@/features/chatbot-config/components/settings/SettingsOverviewPanel';
import type { SettingsSection } from '@/features/chatbot-config/types/chatbot-config.types';

type Props = {
  section: SettingsSection;
};

export function ChatbotConfigSettingsContent({ section }: Props) {
  switch (section) {
    case 'overview':
      return <SettingsOverviewPanel />;
    case 'model':
      return <ModelSettingsPanel />;
    case 'widget-config':
      return <ChatWidgetConfigPanel />;
    case 'widget-customization':
      return <ChatWidgetCustomizationPanel />;
    case 'domains':
      return <AllowedDomainsPanel />;
    case 'feedback':
      return <FeedbackSettingsPanel />;
    case 'privacy':
      return <PrivacySettingsPanel />;
    case 'integrations':
    case 'web-integration':
    case 'mobile-integration':
      return <IntegrationsScriptsPanel />;
    default:
      return null;
  }
}
