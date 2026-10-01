import { MessagesSquare } from 'lucide-react-native';
import React, { useMemo } from 'react';

import { QaSourceSheet } from '@/features/crawl/components/textual/QaSourceSheet';
import {
  TextualSourcePanel,
  type TextualSourcePanelCopy,
} from '@/features/crawl/components/textual/TextualSourcePanel';
import { type TextualSourceConfig, useTextualSources } from '@/features/crawl/hooks/use-textual-sources';
import {
  loadQaSourceForm,
  saveQaSource,
  trainQaSource,
} from '@/features/crawl/services/textual-sources.service';
import type { QaSourceForm } from '@/features/crawl/types/textual-source.types';
import { emptyQaSourceForm, validateQaSourceForm } from '@/features/crawl/utils/textual-sources';
import { useTranslation } from '@/i18n';

const QA_SOURCE_CONFIG: TextualSourceConfig<QaSourceForm> = {
  kind: 'qa',
  emptyForm: emptyQaSourceForm,
  loadForm: loadQaSourceForm,
  save: saveQaSource,
  train: trainQaSource,
  validate: validateQaSourceForm,
  createdMessageKey: 'crawl.qa.toast.created',
  updatedMessageKey: 'crawl.qa.toast.updated',
};

export function CrawlQaPairsPanel() {
  const { t } = useTranslation();
  const controller = useTextualSources(QA_SOURCE_CONFIG);
  const copy = useMemo<TextualSourcePanelCopy>(
    () => ({
      title: t('crawl.qa.title'),
      subtitle: t('crawl.qa.description'),
      listTitle: t('crawl.qa.listTitle'),
      addLabel: t('crawl.qa.add'),
      typeLabel: t('crawl.qa.typeBadge'),
      searchPlaceholder: t('crawl.qa.search'),
      emptyTitle: t('crawl.qa.empty.title'),
      emptyDescription: t('crawl.qa.empty.description'),
    }),
    [t],
  );

  return (
    <TextualSourcePanel
      icon={MessagesSquare}
      copy={copy}
      items={controller.items}
      targetModelsFor={controller.targetModelsFor}
      trainedModelsFor={controller.trainedModelsFor}
      loadingDocumentId={controller.loadingDocumentId}
      trainRequestIds={controller.trainRequestIds}
      onAdd={controller.openCreate}
      onTrain={(doc) => void controller.train(doc)}
      onEdit={(doc) => void controller.openEdit(doc)}
      onDelete={controller.requestDelete}>
      <QaSourceSheet
        editor={controller.editor}
        saving={controller.saving}
        error={controller.formError}
        onClose={controller.closeEditor}
        onSubmit={(form) => void controller.submit(form)}
      />
    </TextualSourcePanel>
  );
}
