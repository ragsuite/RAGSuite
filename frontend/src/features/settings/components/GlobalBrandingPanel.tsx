import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Trash2, Upload } from 'lucide-react-native';

import { SETTINGS_COPY } from '@/features/settings/data/settings.copy';
import type { WorkspaceBranding } from '@/features/settings/types/settings.types';
import {
  applyEffectiveWorkspaceBranding,
  canCustomizeWorkspaceBrand,
} from '@/features/settings/utils/workspace-brand-gate';
import { useModuleWriteEnabled } from '@/features/organization/hooks/use-module-write';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useTranslation } from '@/i18n';
import { EnterpriseLockedPreview, WorkspaceWhiteLabelMock } from '@/platform/ee-locked';
import { APP_BUTTON_COMPACT_HEIGHT } from '@/shared/components/app-button';
import {
  AppColorFieldInput,
  AppColorFieldPickerTrigger,
  AppColorFieldRoot,
} from '@/shared/components/app-color-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { BrandingLogo } from '@/shared/components/branding-logo';
import { BrandedBackground } from '@/shared/components/branded-background';
import { InfoHintButton } from '@/shared/components/info-hint-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { SettingsPanelActions } from '@/features/settings/components/SettingsPanelActions';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { normalizeHex } from '@/shared/utils/color-picker';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webLockedCursor } from '@/shared/utils/web-locked-cursor';

type PreviewPayload = WorkspaceBranding & { primaryColor: string };

type Props = {
  branding: WorkspaceBranding;
  primaryColor: string;
  saving?: boolean;
  onSave: (payload: PreviewPayload) => void;
  onReset?: () => void;
};

function normalizeColorInput(value: string) {
  let next = value.trim();
  if (/^[0-9a-fA-F]{3}$/.test(next) || /^[0-9a-fA-F]{6}$/.test(next)) {
    next = `#${next}`;
  }
  return next;
}

export function GlobalBrandingPanel({
  branding,
  primaryColor,
  saving = false,
  onSave,
  onReset,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { confirm } = useConfirm();
  const controlRadius = surfaceRadius.button;
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const { enterpriseModulesAvailable } = useOrgAdminAccess();
  const brandEditable = canCustomizeWorkspaceBrand(enterpriseModulesAvailable);
  const canWrite = useModuleWriteEnabled();
  const [orgName, setOrgName] = useState(branding.orgName);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(branding.logoDataUrl);
  const [color, setColor] = useState(primaryColor);

  React.useEffect(() => {
    const effective = applyEffectiveWorkspaceBranding(branding, brandEditable);
    setOrgName(effective.orgName);
    setLogoDataUrl(effective.logoDataUrl);
    setColor(primaryColor);
  }, [brandEditable, branding, branding.logoDataUrl, branding.orgName, primaryColor]);

  const pickLogo = async () => {
    if (!brandEditable || !canWrite) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const mime = result.assets[0].mimeType ?? 'image/png';
    const nextLogo = `data:${mime};base64,${result.assets[0].base64}`;
    setLogoDataUrl(nextLogo);
  };

  const applyColor = (next: string) => {
    const normalized = normalizeColorInput(next);
    if (!canWrite) return;
    if (!normalized.startsWith('#') && !normalized.startsWith('rgb(') && !normalized.startsWith('hsl(')) {
      setColor(normalized);
      return;
    }
    const resolved = normalizeHex(normalized);
    setColor(resolved);
  };

  const previewColor = normalizeHex(color);
  const previewOrgName = orgName.trim() || BRANDING_DEFAULTS.orgName;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={[styles.grid, { gap: spacing.lg }]}>
        <View style={[styles.col, { gap: spacing.md }]}>
          {!brandEditable ? (
            <EnterpriseLockedPreview
              variant="section"
              featureName={t('enterprise.locked.features.workspaceBranding', {
                defaultValue: 'Custom logo & name',
              })}
              message={t('enterprise.locked.messages.workspaceBranding', {
                defaultValue: 'Use your own logo and organization name in the admin app.',
              })}>
              <WorkspaceWhiteLabelMock />
            </EnterpriseLockedPreview>
          ) : (
            <>
              <View style={{ gap: spacing.xs }}>
                <View style={[styles.labelRow, { gap: spacing.xs }]}>
                  <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('settings.branding.logoUpload')}</Text>
                  <InfoHintButton
                    title={t('settings.branding.logoHint.title')}
                    body={t('settings.branding.logoHint')}
                    accessibilityLabel={t('settings.branding.logoHint.title')}
                    iconSize={18}
                  />
                </View>
                <View style={[styles.logoRow, { gap: spacing.sm }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.branding.logoUpload.a11y')}
                    accessibilityState={{ disabled: !canWrite }}
                    disabled={!canWrite}
                    onPress={() => void pickLogo()}
                    style={[
                      styles.logoButton,
                      {
                        borderRadius: controlRadius,
                        borderColor: colors.border,
                        borderStyle: 'dashed',
                        backgroundColor: colors.surfaceMuted,
                        opacity: canWrite ? 1 : 0.72,
                      },
                      webLockedCursor(!canWrite),
                    ]}>
                    {logoDataUrl ? (
                      <BrandingLogo
                        logoDataUrl={logoDataUrl}
                        size={80}
                        color={colors.textOnPrimary}
                        backgroundColor={previewColor}
                        borderRadius={controlRadius}
                        variant="user"
                      />
                    ) : (
                      <View style={[styles.logoEmpty, { gap: spacing.xxs }]}>
                        <Upload size={22} color={colors.primary} strokeWidth={2} />
                        <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
                          {t('settings.branding.logoEmptyHint')}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  <View style={[styles.logoActions, { gap: spacing.xs }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.branding.logoUpload.a11y')}
                      accessibilityState={{ disabled: !canWrite }}
                      disabled={!canWrite}
                      onPress={() => void pickLogo()}
                      style={({ pressed }) => [
                        styles.iconAction,
                        {
                          borderRadius: controlRadius,
                          borderColor: colors.border,
                          backgroundColor: canWrite && pressed ? colors.surfaceMuted : colors.surface,
                          opacity: canWrite ? 1 : 0.72,
                        },
                        webLockedCursor(!canWrite),
                      ]}>
                      <Upload size={18} color={colors.primary} strokeWidth={2} />
                    </Pressable>
                    {canWrite && logoDataUrl ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('settings.branding.logoRemove.a11y')}
                        onPress={() => {
                          setLogoDataUrl(null);
                        }}
                        style={({ pressed }) => [
                          styles.iconAction,
                          {
                            borderRadius: controlRadius,
                            borderColor: colors.border,
                            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                          },
                        ]}>
                        <Trash2 size={18} color={colors.danger} strokeWidth={2} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>

              <AppTextField
                label={t('settings.branding.orgName')}
                value={orgName}
                onChangeText={(value) => {
                  setOrgName(value);
                }}
              />
            </>
          )}

          <AppColorFieldRoot label="" value={color} onChange={applyColor}>
            <View
              style={[
                styles.brandColorCard,
                {
                  gap: spacing.sm,
                  borderColor: colors.border,
                  borderRadius: panelRadius,
                  backgroundColor: colors.surfaceMuted,
                  padding: spacing.sm,
                },
              ]}>
              <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('settings.branding.brandColor')}</Text>
              <AppColorFieldInput showLabel={false} />
              <View style={[styles.presets, { gap: spacing.xs }]}>
                {SETTINGS_COPY.presets.map((preset) => {
                  const selected = previewColor.toLowerCase() === preset.toLowerCase();
                  return (
                    <Pressable
                      key={preset}
                      accessibilityRole="button"
                      accessibilityLabel={`Theme preset ${preset}`}
                      accessibilityState={{ disabled: !canWrite }}
                      disabled={!canWrite}
                      onPress={() => applyColor(preset)}
                      style={[
                        styles.preset,
                        {
                          borderColor: selected ? colors.text : colors.border,
                          backgroundColor: preset,
                          borderRadius: surfaceRadius.button,
                          opacity: canWrite ? 1 : 0.72,
                        },
                        webLockedCursor(!canWrite),
                      ]}
                    />
                  );
                })}
                <AppColorFieldPickerTrigger size={{ width: 40, height: 32 }} />
              </View>
            </View>
          </AppColorFieldRoot>
        </View>

        <View style={[styles.col, { gap: spacing.sm }]}>
          <View style={[styles.previewTitleRow, { gap: spacing.sm }]}>
            <Text style={[typography.fieldLabel, { color: colors.text, flexShrink: 1 }]}>
              {t('settings.branding.livePreview')}
            </Text>
            <StatusBadge
              label={t('settings.branding.livePreview.badge')}
              tone="active"
              size="compact"
              preserveCase
            />
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
            {t('settings.branding.livePreview.hint')}
          </Text>
          <View
            style={[
              styles.previewCard,
              {
                borderColor: colors.primary,
                borderRadius: panelRadius,
                backgroundColor: colors.surfaceMuted,
                overflow: 'hidden',
                minHeight: 220,
              },
            ]}>
            <BrandedBackground theme="simple" style={styles.previewBg}>
              <View
                style={[
                  styles.previewHeaderBar,
                  {
                    backgroundColor: colors.surface,
                    borderBottomColor: colors.border,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                    gap: spacing.xs,
                  },
                ]}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {t('settings.branding.preview.adminHeader')}
                </Text>
                <View style={[styles.previewHeader, { gap: spacing.sm }]}>
                  <BrandingLogo
                    logoDataUrl={logoDataUrl}
                    size={32}
                    color={colors.textOnPrimary}
                    backgroundColor={previewColor}
                    borderRadius={controlRadius}
                    variant="user"
                  />
                  <Text style={[typography.body, { color: colors.text, fontWeight: '600', flex: 1 }]} numberOfLines={1}>
                    {previewOrgName}
                  </Text>
                </View>
              </View>
              <View style={{ padding: spacing.sm, gap: spacing.sm }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.previewCta,
                    {
                      height: APP_BUTTON_COMPACT_HEIGHT,
                      borderRadius: surfaceRadius.button,
                      backgroundColor: previewColor,
                    },
                  ]}>
                  <Text style={[typography.body, { color: colors.textOnPrimary, fontWeight: '600' }]}>
                    {t('settings.branding.primaryButton')}
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
                  {t('settings.branding.previewDescription')}
                </Text>
              </View>
            </BrandedBackground>
          </View>
        </View>
      </View>

      <SettingsPanelActions
        saving={saving}
        resetDisabled={!onReset}
        onReset={() => {
          void (async () => {
            if (!onReset) return;
            const confirmed = await confirm({
              title: t('settings.branding.confirm.reset.title'),
              message: t('settings.branding.confirm.reset.message'),
              cancelLabel: t('common.cancel'),
              confirmLabel: t('settings.branding.confirm.reset.action'),
              variant: 'warning',
            });
            if (confirmed) onReset();
          })();
        }}
        onSave={() => {
          const effective = applyEffectiveWorkspaceBranding(
            { orgName: orgName.trim(), logoDataUrl },
            brandEditable,
          );
          onSave({
            orgName: effective.orgName,
            logoDataUrl: effective.logoDataUrl,
            primaryColor: previewColor,
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  col: {
    flex: 1,
    minWidth: Platform.OS === 'web' ? 320 : 280,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  logoActions: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  logoButton: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  logoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  iconAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  brandColorCard: {
    borderWidth: 1,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  preset: {
    width: 40,
    height: 32,
    borderWidth: 1,
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  previewCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  previewCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBg: {
    flex: 1,
    minHeight: 180,
  },
  previewHeaderBar: {
    borderBottomWidth: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
