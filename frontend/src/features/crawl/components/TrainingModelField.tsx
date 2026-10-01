import React from 'react';

import { EmbeddingProviderPicker } from '@/features/crawl/components/EmbeddingProviderPicker';
import type { EmbeddingProviderSelection } from '@/features/crawl/hooks/use-embedding-provider-selection';
import { useTranslation } from '@/i18n';

type Props = {
  selection: EmbeddingProviderSelection;
  onOpenModelConfiguration?: () => void;
};

/** "AI model for training" picker for uploaded documents, Text and Q&A sources. */
export function TrainingModelField({ selection, onOpenModelConfiguration }: Props) {
  const { t } = useTranslation();
  return (
    <EmbeddingProviderPicker
      loading={selection.loading}
      failed={selection.failed}
      options={selection.options}
      selected={selection.selected}
      messages={selection.messages}
      helper={t('documents.form.embeddingTargetHelper')}
      onSelect={selection.select}
      onOpenModelConfiguration={onOpenModelConfiguration}
    />
  );
}
