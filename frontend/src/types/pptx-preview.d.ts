/// <reference types="node" />
declare module 'pptx-preview' {
  export type PptxPreviewOptions = {
    width?: number;
    height?: number;
  };

  export type PptxPreviewer = {
    preview: (data: ArrayBuffer) => Promise<void> | void;
  };

  export function init(host: HTMLElement, options?: PptxPreviewOptions): PptxPreviewer;
}
