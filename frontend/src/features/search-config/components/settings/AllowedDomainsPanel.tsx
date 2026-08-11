import { Globe } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import {
  AddAllowedUrlForm,
  AllowedDomainRow,
  DomainValidationCallout,
} from '@/features/chatbot-config/components/settings/allowed-domains-panel-parts';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import type { DomainScope } from '@/features/search-config/types/search-config.types';
import { buildAllowedUrlRuleFromInput } from '@/features/search-config/utils/allowed-url-rules';
import { useTranslation } from '@/i18n';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const DOMAINS_LIST_MAX_HEIGHT = 280;

export function AllowedDomainsPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { showSettingsSidebar } = useSearchConfigLayout();
  const { bundle, loading, saving, handleAddDomain, handleRemoveDomain } = useSearchConfig();
  const [domainInput, setDomainInput] = useState('');
  const [scope, setScope] = useState<DomainScope>('entire-site');
  const [scopeManuallySet, setScopeManuallySet] = useState(false);
  const domains = bundle?.allowedDomains ?? [];
  const isWide = showSettingsSidebar;

  useEffect(() => {
    if (scopeManuallySet) return;
    const rule = buildAllowedUrlRuleFromInput(domainInput, 'page-only');
    if (rule && rule.pathname !== '/') {
      setScope('page-only');
    } else {
      setScope('entire-site');
    }
  }, [domainInput, scopeManuallySet]);

  const onAdd = async () => {
    const ok = await handleAddDomain(domainInput, scope);
    if (ok) {
      setDomainInput('');
      setScopeManuallySet(false);
      setScope('entire-site');
    }
  };

  const onRemove = (id: string) => {
    void handleRemoveDomain(id);
  };

  if (loading && !bundle) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('search.domains.loading')}</Text>
      </View>
    );
  }

  return (
    <SearchConfigPanelCard
      icon={Globe}
      title={t('search.domains.title')}
      subtitle={t('search.domains.description')}>
      <View style={{ gap: spacing.md }}>
      <SectionCard
        title={t('search.domains.addUrl.title')}
        subtitle={t('search.domains.addUrl.subtitle')}>
        <AddAllowedUrlForm
          domainInput={domainInput}
          scope={scope}
          saving={saving}
          isWide={isWide}
          domainsNs="search"
          onDomainChange={setDomainInput}
          onScopeChange={(value) => {
            setScope(value);
            setScopeManuallySet(true);
          }}
          onAdd={() => void onAdd()}
        />
      </SectionCard>

      <SectionCard
        title={t('search.domains.allowedUrls.title')}
        titleRight={
          <View
            style={[
              styles.entriesBadge,
              { borderColor: colors.border, borderRadius: surfaceRadius.button, backgroundColor: colors.surface },
            ]}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
              {t(domains.length === 1 ? 'search.domains.entry' : 'search.domains.entries', {
                count: domains.length,
              })}
            </Text>
          </View>
        }
        subtitle={domains.length === 0 ? t('search.domains.empty.subtitle') : undefined}>
        <StatePanel
          isEmpty={domains.length === 0}
          emptyLabel={t('search.domains.empty.label')}
          emptyDescription={t('search.domains.empty.description')}>
          <AppScrollView
            nestedScrollEnabled
            scrollbarVariant="overlay"
            style={{ maxHeight: DOMAINS_LIST_MAX_HEIGHT, marginTop: spacing.xs }}
            contentContainerStyle={{ gap: spacing.sm }}>
            {domains.map((domain) => (
              <AllowedDomainRow
                key={domain.id}
                domain={domain}
                saving={saving}
                domainsNs="search"
                onRemove={onRemove}
              />
            ))}
          </AppScrollView>
        </StatePanel>
      </SectionCard>

      <DomainValidationCallout domainsNs="search" />
      </View>
    </SearchConfigPanelCard>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  entriesBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
