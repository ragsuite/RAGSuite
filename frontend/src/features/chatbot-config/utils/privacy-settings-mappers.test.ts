import { mapPrivacyFromConfiguration, mapPrivacySettingsToApi } from '@/features/chatbot-config/utils/chatbot-api-mappers';
import { mapPrivacyFromSearchConfiguration, mapPrivacySettingsToSearchApiUpdate } from '@/features/search-config/utils/search-api-mappers';
import type { SearchBoxConfig } from '@/features/search-config/types/search-config.types';

describe('privacy settings mappers', () => {
  it('maps chatbot store_history_enabled from API', () => {
    const result = mapPrivacyFromConfiguration(
      { store_history_enabled: false },
      { storeHistoryEnabled: true },
    );
    expect(result.storeHistoryEnabled).toBe(false);
  });

  it('maps chatbot store_history_enabled to API update', () => {
    const result = mapPrivacySettingsToApi(
      {
        title: 'Bot',
        bubbleMessage: 'Hi',
        welcomeMessage: 'Welcome',
        language: 'en',
      } as never,
      { storeHistoryEnabled: false },
      true,
    );
    expect(result.store_history_enabled).toBe(false);
    expect(result.feedback_enabled).toBe(true);
  });

  it('maps search store_history_enabled from API', () => {
    const result = mapPrivacyFromSearchConfiguration(
      { store_history_enabled: false },
      { storeHistoryEnabled: true },
    );
    expect(result?.storeHistoryEnabled).toBe(false);
  });

  it('maps search privacy to configuration update', () => {
    const config = {
      title: 'Search',
      language: 'en-us',
      style: 'customise',
      searchIcon: 'search',
      loader: 'skeleton',
      backgroundColor: '#ccc',
      borderRadius: 'semi-rounded',
      collectUserFeedback: true,
      resultStyle: 'list',
    } as SearchBoxConfig;
    const result = mapPrivacySettingsToSearchApiUpdate({ storeHistoryEnabled: false }, config);
    expect(result.store_history_enabled).toBe(false);
    expect(result.feedback_enabled).toBe(true);
  });
});
