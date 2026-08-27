export type TrustCenterTabId =
  | 'overview'
  | 'dpa'
  | 'subprocessors'
  | 'security'
  | 'processing'
  | 'ai';

export type TrustDocSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type TrustDocument = {
  id: TrustCenterTabId;
  title: string;
  version: string;
  updatedAt: string;
  sections: TrustDocSection[];
};

export const TRUST_CENTER_VERSION = '1.0.0';
export const TRUST_CENTER_UPDATED_AT = '2026-08-27';

export const TRUST_CENTER_TAB_IDS: TrustCenterTabId[] = [
  'overview',
  'dpa',
  'subprocessors',
  'security',
  'processing',
  'ai',
];
