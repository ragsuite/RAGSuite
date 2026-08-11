import { Globe, Info } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AllowedDomainEntry, DomainScope } from '@/features/chatbot-config/types/chatbot-config.types';
import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import {
  formatAllowedUrlDisplay,
  formatAllowedUrlScopeLabel,
  ruleFromAllowedDomainEntry,
} from '@/features/search-config/utils/allowed-url-rules';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type DomainsNs = 'chatbot' | 'search';

const DOMAIN_SCOPE_KEYS: DomainScope[] = ['entire-site', 'page-only', 'page-and-subpaths'];

function scopeLabelKey(ns: DomainsNs, scope: DomainScope) {
  if (scope === 'entire-site') return `${ns}.domains.scope.entireSite`;
  if (scope === 'page-only') return `${ns}.domains.scope.pageOnly`;
  return `${ns}.domains.scope.pageAndSubpaths`;
}

function validationBulletKeys(ns: DomainsNs) {
  return [
    `${ns}.domains.validation.bullet1`,
    `${ns}.domains.validation.bullet2`,
    `${ns}.domains.validation.bullet3`,
    `${ns}.domains.validation.bullet4`,
    `${ns}.domains.validation.bullet5`,
    `${ns}.domains.validation.bullet6`,
  ] as const;
}


type AddUrlFormProps = {
  domainInput: string;
  scope: DomainScope;
  saving: boolean;
  isWide: boolean;
  domainsNs?: DomainsNs;
  onDomainChange: (value: string) => void;
  onScopeChange: (value: DomainScope) => void;
  onAdd: () => void;
};

export function AddAllowedUrlForm({
  domainInput,
  scope,
  saving,
  isWide,
  domainsNs = 'chatbot',
  onDomainChange,
  onScopeChange,
  onAdd,
}: AddUrlFormProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const canAdd = Boolean(domainInput.trim()) && !saving;
  const scopeOptions = useMemo(
    () =>
      DOMAIN_SCOPE_KEYS.map((key) => ({
        key,
        label: t(scopeLabelKey(domainsNs, key)),
      })),
    [domainsNs, t],
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[styles.addRow, isWide && styles.addRowWide, { gap: spacing.sm }]}>
        <View style={[styles.urlField, isWide && styles.urlFieldWide]}>
          <AppTextField
            label={isWide ? '' : t(`${domainsNs}.domains.urlLabel`)}
            accessibilityLabel={t(`${domainsNs}.domains.addUrl.a11y`)}
            placeholder={t(`${domainsNs}.domains.urlPlaceholder`)}
            value={domainInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={onDomainChange}
            onSubmitEditing={() => {
              if (canAdd) onAdd();
            }}
          />
        </View>
        <View style={[styles.scopeField, isWide && styles.scopeFieldWide]}>
          <AppSelectField
            label={isWide ? '' : t(`${domainsNs}.domains.scopeLabel`)}
            accessibilityLabel={t(`${domainsNs}.domains.scope.a11y`)}
            value={scope}
            options={scopeOptions}
            onChange={onScopeChange}
          />
        </View>
        <View style={[styles.addField, isWide && styles.addFieldWide]}>
          <AddUrlButton disabled={!canAdd} loading={saving} onPress={onAdd} wide={isWide} domainsNs={domainsNs} />
        </View>
      </View>
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
        {t(`${domainsNs}.domains.addUrl.subtitle`)}
      </Text>
    </View>
  );
}

type AddUrlButtonProps = {
  disabled: boolean;
  loading: boolean;
  wide?: boolean;
  domainsNs?: DomainsNs;
  onPress: () => void;
};

function AddUrlButton({ disabled, loading, wide, domainsNs = 'chatbot', onPress }: AddUrlButtonProps) {
  const { t } = useTranslation();

  return (
    <AppButton
      label={t(`${domainsNs}.domains.addButton`)}
      accessibilityLabel={t(`${domainsNs}.domains.addButton.a11y`)}
      variant="cta"
      size="compact"
      icon={ActionIcons.add}
      disabled={disabled}
      loading={loading}
      fullWidth={!wide}
      onPress={onPress}
    />
  );
}

type DomainRowProps = {
  domain: AllowedDomainEntry;
  saving: boolean;
  domainsNs?: DomainsNs;
  onRemove: (id: string) => void;
};

export function AllowedDomainRow({ domain, saving, domainsNs = 'chatbot', onRemove }: DomainRowProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const rule = ruleFromAllowedDomainEntry(domain.domain, domain.scope);
  const displayUrl = rule ? formatAllowedUrlDisplay(rule) : domain.domain;
  const scopeLabel = rule
    ? formatAllowedUrlScopeLabel(rule)
    : t(scopeLabelKey(domainsNs, domain.scope));

  return (
    <View
      style={[
        styles.domainRow,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.button,
          backgroundColor: colors.surface,
          padding: spacing.sm,
        },
      ]}>
      <View style={[styles.domainMain, { gap: spacing.sm }]}>
        <Globe size={16} color={colors.textMuted} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={2}>
            {displayUrl}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{scopeLabel}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(`${domainsNs}.domains.remove.a11y`, { domain: domain.domain })}
        disabled={saving}
        onPress={() => onRemove(domain.id)}
        style={({ pressed }) => [
          styles.removeBtn,
          {
            minWidth: CHATBOT_CONFIG_TOUCH_MIN,
            minHeight: CHATBOT_CONFIG_TOUCH_MIN,
            borderRadius: controlRadius,
            backgroundColor: pressed ? colors.dangerBackground : 'transparent',
          },
        ]}>
        <ActionIcons.delete size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
}

type DomainValidationCalloutProps = {
  domainsNs?: DomainsNs;
};

export function DomainValidationCallout({ domainsNs = 'chatbot' }: DomainValidationCalloutProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const bullets = validationBulletKeys(domainsNs);

  return (
    <View
      style={[
        styles.infoBox,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: panelRadius,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={t(`${domainsNs}.domains.validation.a11y`)}>
      <View style={[styles.infoTitle, { gap: spacing.sm }]}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.infoIconWrap, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: surfaceRadius.button }]}>
          <Info size={16} color={colors.primary} />
        </View>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1 }]}>
          {t(`${domainsNs}.domains.validation.title`)}
        </Text>
      </View>
      {bullets.map((bulletKey) => (
        <View key={bulletKey} style={[styles.bulletRow, { gap: spacing.sm }]}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>•</Text>
          <Text style={[typography.caption, { color: colors.textMuted, flex: 1, lineHeight: 20 }]}>
            {t(bulletKey)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'column' },
  addRowWide: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'nowrap' },
  urlField: { width: '100%' },
  urlFieldWide: { flex: 1, minWidth: 160 },
  scopeField: { width: '100%' },
  scopeFieldWide: { width: 200, flexShrink: 0 },
  addField: { width: '100%' },
  addFieldWide: { flexShrink: 0, width: 'auto' },
  domainRow: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  domainMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
  },
  removeBtn: { alignItems: 'center', justifyContent: 'center' },
  infoBox: { borderWidth: 1 },
  infoTitle: { flexDirection: 'row', alignItems: 'center' },
  infoIconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bulletRow: { flexDirection: 'row', paddingLeft: 2 },
});
