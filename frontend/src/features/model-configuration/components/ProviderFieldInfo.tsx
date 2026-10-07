import React from 'react';

import { useTranslation } from '@/i18n';
import { InfoHintButton } from '@/shared/components/info-hint-button';

type Props =
  | { titleKey: string; bodyKey: string }
  | { title: string; body: string };

/** Info (ⓘ) beside a Model Configuration field label. */
export function ProviderFieldInfo(props: Props) {
  const { t } = useTranslation();
  const title = 'titleKey' in props ? t(props.titleKey) : props.title;
  const body = 'bodyKey' in props ? t(props.bodyKey) : props.body;
  return <InfoHintButton title={title} body={body} accessibilityLabel={title} iconSize={14} />;
}
