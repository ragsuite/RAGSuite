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
};

export type QaSourceForm = {
  title: string;
  pairs: QaPairDraft[];
  description: string;
  language: string;
};

export type TextualSourceEditor<TForm> =
  | { mode: 'create'; initial: TForm }
  | { mode: 'edit'; documentId: string; initial: TForm }
  | null;

export type TextSourceRequest = {
  title: string;
  content: string;
  description?: string;
  language: string;
};

export type QaPairValue = { question: string; answer: string };

export type QaSourceRequest = {
  title: string;
  pairs: QaPairValue[];
  description?: string;
  language: string;
};

export type TextualSourceSaveResponse = {
  id: string;
  status: string;
  message: string;
};
