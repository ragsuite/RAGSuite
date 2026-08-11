import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { MessageSquare, Power } from 'lucide-react-native';

import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import { AppSelectField } from '@/shared/components/app-select-field';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { StatusBadge } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';
import { ActionIcons } from '@/shared/constants/action-icons';

type ResponseType = 'long' | 'short';

const RESPONSE_OPTIONS = (t: ReturnType<typeof useTranslation>['t']): { key: ResponseType; label: string }[] => [
  { key: 'long', label: t('search.training.responseType.long') },
  { key: 'short', label: t('search.training.responseType.short') },
];

export function TrainingActiveConfigPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { isCompact } = useSearchConfigLayout();
  const {
    bundle,
    saving,
    handleSaveSystemPrompt,
    handleSaveResponseConfig,
    handleSaveSearchStatus,
  } = useSearchConfig();
  const config = bundle?.activeConfig;
  const trainingOverview = bundle?.trainingOverview;
  const modelSettings = bundle?.modelSettings;
  const responseConfig = bundle?.searchResponseConfig;
  const [promptDraft, setPromptDraft] = useState('');
  const [responseType, setResponseType] = useState<ResponseType>('long');

  useEffect(() => {
    if (!modelSettings) return;
    setPromptDraft(modelSettings.systemPrompt);
  }, [modelSettings]);

  useEffect(() => {
    if (responseConfig) setResponseType(responseConfig.responseType);
  }, [responseConfig?.responseType]);

  const promptDirty = useMemo(
    () => Boolean(modelSettings && promptDraft !== modelSettings.systemPrompt),
    [modelSettings, promptDraft],
  );
  const responseDirty = useMemo(
    () => Boolean(responseConfig && responseType !== responseConfig.responseType),
    [responseConfig, responseType],
  );

  const searchActive = trainingOverview?.searchReady ?? false;

  return (
    <StatePanel isEmpty={!config || !modelSettings || !trainingOverview} emptyLabel={t('search.training.activeConfig.unavailable')}>
      {config && modelSettings && trainingOverview ? (
        <View style={{ gap: spacing.sm }}>
          <SearchConfigPanelCard
            icon={Power}
            title={t('search.training.activeStatus.title')}
            subtitle={t('search.training.activeStatus.description')}>
            <View style={styles.statusRow}>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text style={[typography.fieldLabel, { color: colors.text }]}>
                  {t('search.training.searchStatus.label')}
                </Text>
                <Text style={[typography.body, { color: colors.textMuted }]}>
                  {searchActive
                    ? t('search.training.activeStatus.activeDescription')
                    : t('search.training.activeStatus.inactiveDescription')}
                </Text>
                {config.name ? (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {config.name} · {config.documentCount.toLocaleString()} indexed vectors
                  </Text>
                ) : null}
                <StatusBadge
                  label={
                    searchActive
                      ? t('search.training.activeStatus.active')
                      : t('search.training.activeStatus.inactive')
                  }
                  tone={searchActive ? 'active' : 'inactive'}
                  preserveCase
                />
              </View>
              <Switch
                accessibilityLabel="Search status"
                value={searchActive}
                disabled={saving}
                onValueChange={(enabled) => void handleSaveSearchStatus(enabled)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>
          </SearchConfigPanelCard>

          <SearchConfigPanelCard
            icon={ActionIcons.edit}
            title={t('search.prompt.title')}
            subtitle={t('search.prompt.description')}>
            <View style={{ gap: spacing.sm }}>
              <Text style={[typography.fieldLabel, { color: colors.text }]}>
                {t('search.prompt.label')}
              </Text>
              <TextInput
                accessibilityLabel={t('search.prompt.label')}
                value={promptDraft}
                multiline
                onChangeText={setPromptDraft}
                placeholder={t('search.prompt.placeholder')}
                placeholderTextColor={colors.textMuted}
                textAlignVertical="top"
                style={[
                  getInputTextStyle(typography.fieldInput, { multiline: true }),
                  styles.promptInput,
                  {
                    minHeight: isCompact ? 140 : 180,
                    color: colors.text,
                    borderColor: colors.border,
                    borderRadius: surfaceRadius.input,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {t('search.prompt.helper')}
              </Text>
              <SearchConfigSaveButton
                label={t('search.prompt.save')}
                disabled={!promptDirty || saving}
                loading={saving}
                onPress={() => void handleSaveSystemPrompt(promptDraft)}
              />
            </View>
          </SearchConfigPanelCard>

          <SearchConfigPanelCard
            icon={MessageSquare}
            title={t('search.training.responseConfig.title')}
            subtitle={t('search.training.responseConfig.description')}>
            <View style={{ gap: spacing.sm }}>
              <Text style={[typography.fieldLabel, { color: colors.text }]}>
                {t('search.training.responseType.label')}
              </Text>
              <AppSelectField
                label=""
                accessibilityLabel={t('search.training.responseType.label')}
                value={responseType}
                options={RESPONSE_OPTIONS(t)}
                onChange={setResponseType}
              />
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {responseType === 'long'
                  ? t('search.training.responseType.longHelp')
                  : t('search.training.responseType.shortHelp')}
              </Text>
              <SearchConfigSaveButton
                label={t('common.save')}
                disabled={!responseDirty || saving}
                loading={saving}
                onPress={() => void handleSaveResponseConfig(responseType)}
              />
            </View>
          </SearchConfigPanelCard>
        </View>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  promptInput: {
    borderWidth: 1,
    width: '100%',
  },
});
