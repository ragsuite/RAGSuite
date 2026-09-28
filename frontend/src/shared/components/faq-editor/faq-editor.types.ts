/** One admin-configured FAQ entry (chatbot FAQ and search FAQ share this shape). */
export type FaqEditorItem = {
  id: string;
  text: string;
  answer: string;
  order: number;
};

export type FaqEditorLengths = {
  questionMaxLength: number;
  answerMaxLength: number;
};

export type FaqEditorItemPatch = Pick<FaqEditorItem, 'text' | 'answer'>;
