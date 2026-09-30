import React from 'react';
import { View } from 'react-native';

import { SourceToggleRow } from '@/features/crawl/components/SourceToggleRow';
import type { AddSourcePayload } from '@/features/crawl/types/crawl.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type ToggleField = 'index_site_header' | 'index_site_footer' | 'rescope_root_links';

type ToggleCopy = { label: string; helper: string; info: string };

type Props = {
  form: AddSourcePayload;
  showRescopeRootLinks: boolean;
  onChange: (patch: Partial<AddSourcePayload>) => void;
};

export function AddSourceToggles({ form, showRescopeRootLinks, onChange }: Props) {
  const { spacing } = useAppTheme();
  const { t } = useTranslation();

  const toggle = (field: ToggleField, copy: ToggleCopy) => (
    <SourceToggleRow
      label={copy.label}
      description={copy.helper}
      info={{ title: copy.label, body: copy.info }}
      value={form[field]}
      onChange={(enabled) => onChange({ [field]: enabled })}
    />
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <SourceToggleRow
        label={t('crawl.form.headless.label')}
        description={t('crawl.form.headless.helper')}
        info={{ title: t('crawl.form.headless.label'), body: t('crawl.form.headless.info') }}
        value={form.headless_mode === 'ON'}
        onChange={(enabled) => onChange({ headless_mode: enabled ? 'ON' : 'OFF' })}
      />
      {toggle('index_site_header', {
        label: t('crawl.form.indexSiteHeader.label'),
        helper: t('crawl.form.indexSiteHeader.helper'),
        info: t('crawl.form.indexSiteHeader.info'),
      })}
      {toggle('index_site_footer', {
        label: t('crawl.form.indexSiteFooter.label'),
        helper: t('crawl.form.indexSiteFooter.helper'),
        info: t('crawl.form.indexSiteFooter.info'),
      })}
      {showRescopeRootLinks
        ? toggle('rescope_root_links', {
            label: t('crawl.form.rescopeRootLinks.label'),
            helper: t('crawl.form.rescopeRootLinks.helper'),
            info: t('crawl.form.rescopeRootLinks.info'),
          })
        : null}
    </View>
  );
}
