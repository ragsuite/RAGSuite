import React from 'react';

import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { useTranslation } from '@/i18n';

type Props = {
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onPress: () => void;
};

export function ChatbotConfigSaveButton({ label, loading, ...rest }: Props) {
  const { t } = useTranslation();
  const resolvedLabel =
    label ?? (loading ? t('chatbot.config.saving') : t('chatbot.config.save'));

  return <SearchConfigSaveButton label={resolvedLabel} loading={loading} {...rest} />;
}
