import React from 'react';

import { AllowedDomainsPanel } from '@/features/search-config/components/settings/AllowedDomainsPanel';
import { CitationFormattingPanel } from '@/features/search-config/components/settings/CitationFormattingPanel';
import { IntegrationsScriptsPanel } from '@/features/search-config/components/settings/IntegrationsScriptsPanel';
import { ModelSettingsPanel } from '@/features/search-config/components/settings/ModelSettingsPanel';
import { PredefinedQuestionsPanel } from '@/features/search-config/components/settings/PredefinedQuestionsPanel';
import { SearchBoxConfigPanel } from '@/features/search-config/components/settings/SearchBoxConfigPanel';
import { SearchPrivacySettingsPanel } from '@/features/search-config/components/settings/SearchPrivacySettingsPanel';
import { SearchBoxCustomizationPanel } from '@/features/search-config/components/settings/SearchBoxCustomizationPanel';
import { SearchTestPanel } from '@/features/search-config/components/settings/SearchTestPanel';
import { SettingsOverviewPanel } from '@/features/search-config/components/settings/SettingsOverviewPanel';
import type { SettingsSection } from '@/features/search-config/types/search-config.types';

type Props = {
  section: SettingsSection;
};

export function SearchConfigSettingsContent({ section }: Props) {
  switch (section) {
    case 'overview':
      return <SettingsOverviewPanel />;
    case 'model':
      return <ModelSettingsPanel />;
    case 'domains':
      return <AllowedDomainsPanel />;
    case 'citation':
      return <CitationFormattingPanel />;
    case 'search-box':
      return <SearchBoxConfigPanel />;
    case 'privacy':
      return <SearchPrivacySettingsPanel />;
    case 'search-customization':
      return <SearchBoxCustomizationPanel />;
    case 'predefined':
      return <PredefinedQuestionsPanel />;
    case 'integrations':
      return <IntegrationsScriptsPanel />;
    case 'search-test':
      return <SearchTestPanel />;
    default:
      return null;
  }
}
