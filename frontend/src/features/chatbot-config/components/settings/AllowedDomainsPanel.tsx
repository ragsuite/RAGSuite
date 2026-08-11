import { Globe } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import {
  AddAllowedUrlForm,
  AllowedDomainRow,
  DomainValidationCallout,
} from '@/features/chatbot-config/components/settings/allowed-domains-panel-parts';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import type { DomainScope } from '@/features/chatbot-config/types/chatbot-config.types';
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
  const { showSettingsSidebar } = useChatbotConfigLayout();
  const { bundle, loading, saving, handleAddDomain, handleRemoveDomain } = useChatbotConfig();
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
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('chatbot.domains.loading')}</Text>
      </View>
    );
  }

  return (
    <SearchConfigPanelCard
      icon={Globe}
      title={t('chatbot.domains.title')}
      subtitle={t('chatbot.domains.description')}>
      <View style={{ gap: spacing.md }}>
      <SectionCard
        title={t('chatbot.domains.addUrl.title')}
        subtitle={t('chatbot.domains.addUrl.subtitle')}>
        <AddAllowedUrlForm
          domainInput={domainInput}
          scope={scope}
          saving={saving}
          isWide={isWide}
          onDomainChange={setDomainInput}
          onScopeChange={(value) => {
            setScope(value);
            setScopeManuallySet(true);
          }}
          onAdd={() => void onAdd()}
        />
      </SectionCard>

      <SectionCard
        title={t('chatbot.domains.allowedUrls.title')}
        titleRight={
          <View
            style={[
              styles.entriesBadge,
              { borderColor: colors.border, borderRadius: surfaceRadius.button, backgroundColor: colors.surface },
            ]}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
              {t(domains.length === 1 ? 'chatbot.domains.entry' : 'chatbot.domains.entries', {
                count: domains.length,
              })}
            </Text>
          </View>
        }
        subtitle={domains.length === 0 ? t('chatbot.domains.empty.subtitle') : undefined}>
        <StatePanel
          isEmpty={domains.length === 0}
          emptyLabel={t('chatbot.domains.empty.label')}
          emptyDescription={t('chatbot.domains.empty.description')}>
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
                onRemove={onRemove}
              />
            ))}
          </AppScrollView>
        </StatePanel>
      </SectionCard>

      <DomainValidationCallout />
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
