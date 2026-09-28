import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { CrawlCardGrid } from '@/features/crawl/components/CrawlCardGrid';
import { CrawlPanelCard } from '@/features/crawl/components/CrawlPanelCard';
import { CrawlTabPanelHeader } from '@/features/crawl/components/CrawlTabPanelHeader';
import { TextualSourceCard } from '@/features/crawl/components/textual/TextualSourceCard';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type TextualSourcePanelCopy = {
  title: string;
  subtitle: string;
  listTitle: string;
  addLabel: string;
  typeLabel: string;
  emptyTitle: string;
  emptyDescription: string;
};

type Props = {
  icon: LucideIcon;
  copy: TextualSourcePanelCopy;
  items: CrawlDocument[];
  targetModels: string[];
  trainedModelsFor: (doc: CrawlDocument) => string[];
  loadingDocumentId: string | null;
  trainRequestIds: ReadonlySet<string>;
  onAdd: () => void;
  onTrain: (doc: CrawlDocument) => void;
  onEdit: (doc: CrawlDocument) => void;
  onDelete: (doc: CrawlDocument) => void;
  children?: React.ReactNode;
};

/** Shared layout for the Text and Q&A Pairs source tabs. */
export function TextualSourcePanel({
  icon,
  copy,
  items,
  targetModels,
  trainedModelsFor,
  loadingDocumentId,
  trainRequestIds,
  onAdd,
  onTrain,
  onEdit,
  onDelete,
  children,
}: Props) {
  const { spacing } = useAppTheme();
  const { t } = useTranslation();
  const trainedCount = items.filter((doc) => doc.status === 'indexed').length;
  const meta =
    items.length === 0 ? undefined : t('crawl.textual.summary', { total: items.length, trained: trainedCount });

  return (
    <View style={{ gap: spacing.md }} accessibilityLabel={copy.title}>
      <CrawlTabPanelHeader
        icon={icon}
        title={copy.title}
        subtitle={copy.subtitle}
        meta={meta}
        trailing={
          <AppButton variant="cta" size="compact" label={copy.addLabel} icon={ActionIcons.add} onPress={onAdd} />
        }
      />
      <CrawlPanelCard title={copy.listTitle}>
        {items.length === 0 ? (
          <EmptyStateView
            variant="inline"
            icon={icon}
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            actionLabel={copy.addLabel}
            onAction={onAdd}
          />
        ) : (
          <CrawlCardGrid
            items={items}
            keyExtractor={(doc) => doc.id}
            renderItem={(doc) => (
              <TextualSourceCard
                document={doc}
                icon={icon}
                typeLabel={copy.typeLabel}
                targetModels={targetModels}
                trainedModels={trainedModelsFor(doc)}
                loading={loadingDocumentId === doc.id}
                trainRequestPending={trainRequestIds.has(doc.id)}
                onTrain={() => onTrain(doc)}
                onEdit={() => onEdit(doc)}
                onDelete={() => onDelete(doc)}
              />
            )}
          />
        )}
      </CrawlPanelCard>
      {children}
    </View>
  );
}
