import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react-native';

import { ConfigurationPanelCard } from '@/features/configuration/components/ConfigurationPanelCard';
import { ConfigurationSecondaryTabs } from '@/features/configuration/components/ConfigurationTabs';
import { useConfiguration } from '@/features/configuration/hooks/useConfiguration';
import type { CurlCommandVariant } from '@/features/configuration/types/configuration.types';
import { buildCurlSnippet } from '@/features/configuration/utils/curl-snippets';
import { IntegrationCodeBlock } from '@/shared/components/integration-code-block';
import { useTranslation } from '@/i18n';
import { copyText } from '@/shared/utils/copy-text';

export function CurlCommandPanel() {
  const { t } = useTranslation();
  const { curlVariant, setCurlVariant, notify } = useConfiguration();
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const curlTabs: { key: CurlCommandVariant; label: string }[] = [
    { key: 'retrieve', label: t('api-keys.curl.retrieve') },
    { key: 'search', label: t('api-keys.curl.search') },
  ];

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const snippet = buildCurlSnippet(curlVariant);

  const handleCopy = async () => {
    const ok = await copyText(snippet);
    if (!ok) {
      notify(t('api-keys.curl.copyFailed'), 'error');
      return;
    }
    setCopied(true);
    notify(t('api-keys.curl.copiedShort'));
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ConfigurationPanelCard
      icon={Terminal}
      title={t('api-keys.curl.title')}
      subtitle={t('api-keys.curl.description')}>
      <ConfigurationSecondaryTabs tabs={curlTabs} activeTab={curlVariant} onChange={setCurlVariant} />
      <IntegrationCodeBlock
        code={snippet}
        accessibilityLabel={t('api-keys.curl.a11y.snippet')}
        copied={copied}
        onCopy={() => void handleCopy()}
        copyButtonLabel={t('api-keys.curl.a11y.copyButton')}
      />
    </ConfigurationPanelCard>
  );
}
