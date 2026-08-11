import type {
  SearchBoxButtonType,
  SearchBoxFormType,
} from '@/features/search-config/types/search-config.types';

export const SEARCH_BOX_FORM_TYPE_OPTIONS: { key: SearchBoxFormType; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'with-button', label: 'With Button' },
];

export const SEARCH_BOX_BUTTON_TYPE_OPTIONS: { key: SearchBoxButtonType; label: string }[] = [
  { key: 'search-icon', label: 'Search Icon' },
  { key: 'with-label', label: 'With Label' },
];

export function searchFormTypeLabel(formType: SearchBoxFormType): string {
  return SEARCH_BOX_FORM_TYPE_OPTIONS.find((o) => o.key === formType)?.label ?? formType;
}

export function searchButtonTypeLabel(buttonType: SearchBoxButtonType): string {
  return SEARCH_BOX_BUTTON_TYPE_OPTIONS.find((o) => o.key === buttonType)?.label ?? buttonType;
}
