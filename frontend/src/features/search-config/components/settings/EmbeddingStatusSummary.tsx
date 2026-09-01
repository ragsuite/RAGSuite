import React from 'react';
import { Text } from 'react-native';

import type { EmbeddingStatus } from '@/features/search-config/types/embedding.types';
import { EmbeddingStatusConfigHints } from '@/features/search-config/components/settings/EmbeddingStatusConfigHints';
import {
  buildEmbeddingStatusSummaryLines,
  embeddingStatusSummaryEmptyBodyKey,
  embeddingStatusSummaryTitleKey,
  type EmbeddingStatusNamespace,
  type EmbeddingStatusSummaryVariant,
} from '@/features/search-config/utils/embedding-status-summary';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  status: EmbeddingStatus;
  namespace: EmbeddingStatusNamespace;
  variant: EmbeddingStatusSummaryVariant;
  textColor: string;
  progressLine?: string | null;
};

export function EmbeddingStatusSummary({
  status,
  namespace,
  variant,
  textColor,
  progressLine,
}: Props) {
  const { t } = useTranslation();
  const { typography } = useAppTheme();
  const captionStyle = [typography.caption, { color: textColor, lineHeight: 18 }];
  const lines = buildEmbeddingStatusSummaryLines(status, namespace, variant, t);

  return (
    <>
      <Text style={[typography.body, { color: textColor, fontWeight: '500' }]}>
        {t(embeddingStatusSummaryTitleKey(namespace, variant))}
      </Text>
      {variant === 'empty' ? (
        <Text style={captionStyle}>
          {t(embeddingStatusSummaryEmptyBodyKey(namespace), { model: status.active_model })}
        </Text>
      ) : (
        lines.map((line) => (
          <Text key={line.kind} style={captionStyle}>
            {line.text}
          </Text>
        ))
      )}
      <EmbeddingStatusConfigHints status={status} namespace={namespace} textColor={textColor} />
      {progressLine ? <Text style={captionStyle}>{progressLine}</Text> : null}
    </>
  );
}
