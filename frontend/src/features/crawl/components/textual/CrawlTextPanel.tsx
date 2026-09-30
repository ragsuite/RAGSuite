import { Type } from 'lucide-react-native';
import React, { useMemo } from 'react';

import { TextSourceSheet } from '@/features/crawl/components/textual/TextSourceSheet';
import {
  TextualSourcePanel,
  type TextualSourcePanelCopy,
} from '@/features/crawl/components/textual/TextualSourcePanel';
import { type TextualSourceConfig, useTextualSources } from '@/features/crawl/hooks/use-textual-sources';
import {
  loadTextSourceForm,
  saveTextSource,
  trainTextSource,
} from '@/features/crawl/services/textual-sources.service';
import type { TextSourceForm } from '@/features/crawl/types/textual-source.types';
import { emptyTextSourceForm, validateTextSourceForm } from '@/features/crawl/utils/textual-sources';
import { useTranslation } from '@/i18n';

const TEXT_SOURCE_CONFIG: TextualSourceConfig<TextSourceForm> = {
  kind: 'text',
  emptyForm: emptyTextSourceForm,
  loadForm: loadTextSourceForm,
  save: saveTextSource,
  train: trainTextSource,
  validate: validateTextSourceForm,
  createdMessageKey: 'crawl.text.toast.created',
  updatedMessageKey: 'crawl.text.toast.updated',
};

export function CrawlTextPanel() {
  const { t } = useTranslation();
  const controller = useTextualSources(TEXT_SOURCE_CONFIG);
  const copy = useMemo<TextualSourcePanelCopy>(
    () => ({
      title: t('crawl.text.title'),
      subtitle: t('crawl.text.description'),
      listTitle: t('crawl.text.listTitle'),
      addLabel: t('crawl.text.add'),
      typeLabel: t('crawl.text.typeBadge'),
      searchPlaceholder: t('crawl.text.search'),
      emptyTitle: t('crawl.text.empty.title'),
      emptyDescription: t('crawl.text.empty.description'),
    }),
    [t],
  );

  return (
    <TextualSourcePanel
      icon={Type}
      copy={copy}
      items={controller.items}
      targetModels={controller.targetModels}
      trainedModelsFor={controller.trainedModelsFor}
      loadingDocumentId={controller.loadingDocumentId}
      trainRequestIds={controller.trainRequestIds}
      onAdd={controller.openCreate}
      onTrain={(doc) => void controller.train(doc)}
      onEdit={(doc) => void controller.openEdit(doc)}
      onDelete={controller.requestDelete}>
      <TextSourceSheet
        editor={controller.editor}
        saving={controller.saving}
        error={controller.formError}
        onClose={controller.closeEditor}
        onSubmit={(form) => void controller.submit(form)}
      />
    </TextualSourcePanel>
  );
}
