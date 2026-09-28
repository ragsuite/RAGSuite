import { useCallback, useMemo, useState } from 'react';

import { useTextualTraining } from '@/features/crawl/hooks/use-textual-training';
import { useCrawlManagement } from '@/features/crawl/hooks/useCrawlManagement';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import type {
  TextualSourceEditor,
  TextualSourceKind,
} from '@/features/crawl/types/textual-source.types';
import { isDocumentIngestInFlight } from '@/features/crawl/utils/crawl-document-status';
import { filterTextualSources } from '@/features/crawl/utils/textual-sources';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';

const EMPTY_DOCUMENTS: CrawlDocument[] = [];

export type TextualSourceConfig<TForm> = {
  kind: TextualSourceKind;
  emptyForm: () => TForm;
  loadForm: (doc: CrawlDocument) => Promise<TForm>;
  /** Saves without training; training starts from the card's Train action. */
  save: (form: TForm, documentId?: string) => Promise<void>;
  train: (documentId: string) => Promise<string>;
  validate: (form: TForm) => string | null;
  createdMessageKey: string;
  updatedMessageKey: string;
};

export function useTextualSources<TForm>(config: TextualSourceConfig<TForm>) {
  const { t } = useTranslation();
  const { bundle, reloadBundle, notify, openSheet } = useCrawlManagement();
  const [editor, setEditor] = useState<TextualSourceEditor<TForm>>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingDocumentId, setLoadingDocumentId] = useState<string | null>(null);

  const documents = bundle?.documents ?? EMPTY_DOCUMENTS;
  const { kind, emptyForm, loadForm, save, train, validate, createdMessageKey, updatedMessageKey } = config;
  const items = useMemo(() => filterTextualSources(documents, kind), [documents, kind]);
  const training = useTextualTraining(items, train);

  const openCreate = useCallback(() => {
    setFormError(null);
    setEditor({ mode: 'create', initial: emptyForm() });
  }, [emptyForm]);

  const openEdit = useCallback(
    async (doc: CrawlDocument) => {
      if (isDocumentIngestInFlight(doc.status)) {
        notify(t('crawl.textual.toast.busy'), 'error');
        return;
      }
      setFormError(null);
      setLoadingDocumentId(doc.id);
      try {
        const initial = await loadForm(doc);
        setEditor({ mode: 'edit', documentId: doc.id, initial });
      } catch (err) {
        notify(resolveAppErrorMessage(err, t, 'crawl.textual.toast.loadFailed'), 'error');
      } finally {
        setLoadingDocumentId(null);
      }
    },
    [loadForm, notify, t],
  );

  const closeEditor = useCallback(() => {
    if (saving) return;
    setEditor(null);
    setFormError(null);
  }, [saving]);

  const submit = useCallback(
    async (form: TForm) => {
      if (!editor || saving) return;
      const problem = validate(form);
      if (problem) {
        setFormError(t(problem));
        return;
      }
      const documentId = editor.mode === 'edit' ? editor.documentId : undefined;
      setSaving(true);
      setFormError(null);
      try {
        await save(form, documentId);
        setEditor(null);
        notify(t(documentId ? updatedMessageKey : createdMessageKey));
        await reloadBundle();
      } catch (err) {
        setFormError(resolveAppErrorMessage(err, t, 'common.saveFailed'));
      } finally {
        setSaving(false);
      }
    },
    [createdMessageKey, editor, notify, reloadBundle, save, saving, t, updatedMessageKey, validate],
  );

  const requestDelete = useCallback(
    (doc: CrawlDocument) => openSheet({ type: 'confirm-delete-document', documentId: doc.id }),
    [openSheet],
  );

  return {
    items,
    editor,
    saving,
    formError,
    loadingDocumentId,
    openCreate,
    openEdit,
    closeEditor,
    submit,
    requestDelete,
    ...training,
  };
}

export type TextualSourcesController<TForm> = ReturnType<typeof useTextualSources<TForm>>;
