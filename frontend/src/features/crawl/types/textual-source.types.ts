import type { CrawlProviderIngestTarget } from '@/features/crawl/types/crawl.types';

export type TextualSourceKind = 'text' | 'qa';

export type QaPairDraft = {
  id: string;
  question: string;
  answer: string;
};

export type TextSourceForm = {
  title: string;
  content: string;
  description: string;
  language: string;
  ingestEmbeddingTarget?: CrawlProviderIngestTarget;
};

export type QaSourceForm = {
  title: string;
  pairs: QaPairDraft[];
  description: string;
  language: string;
  ingestEmbeddingTarget?: CrawlProviderIngestTarget;
};

export type TextualSourceEditor<TForm> =
  | { mode: 'create'; initial: TForm }
  | { mode: 'edit'; documentId: string; initial: TForm }
  | null;

export type TextSourceRequest = {
  title: string;
  content: string;
  content_format: 'html' | 'plain';
  description?: string;
  language: string;
  ingest_embedding_target?: CrawlProviderIngestTarget;
};

export type QaPairValue = { question: string; answer: string };

export type QaSourceRequest = {
  title: string;
  pairs: QaPairValue[];
  description?: string;
  language: string;
  ingest_embedding_target?: CrawlProviderIngestTarget;
};

export type TextualSourceSaveResponse = {
  id: string;
  status: string;
  message: string;
};
