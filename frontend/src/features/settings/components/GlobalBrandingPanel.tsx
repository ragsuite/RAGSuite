import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Trash2, Upload } from 'lucide-react-native';

import { SETTINGS_COPY } from '@/features/settings/data/settings.copy';
import type { WorkspaceBranding } from '@/features/settings/types/settings.types';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import {
  AppColorFieldInput,
  AppColorFieldPickerTrigger,
  AppColorFieldRoot,
} from '@/shared/components/app-color-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { BrandingLogo } from '@/shared/components/branding-logo';
import { BrandedBackground } from '@/shared/components/branded-background';
import { InfoHintButton } from '@/shared/components/info-hint-button';
import { SettingsPanelActions } from '@/features/settings/components/SettingsPanelActions';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { normalizeHex } from '@/shared/utils/color-picker';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type PreviewPayload = WorkspaceBranding & { primaryColor: string };

type Props = {
  branding: WorkspaceBranding;
  primaryColor: string;
  saving?: boolean;
  onSave: (payload: PreviewPayload) => void;
  onPreviewChange?: (payload: PreviewPayload) => void;
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
  onPreviewChange,
  onReset,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const [orgName, setOrgName] = useState(branding.orgName);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(branding.logoDataUrl);
  const [color, setColor] = useState(primaryColor);

  React.useEffect(() => {
    setOrgName(branding.orgName);
    setLogoDataUrl(branding.logoDataUrl);
    setColor(primaryColor);
  }, [branding.logoDataUrl, branding.orgName, primaryColor]);

  const publishPreview = React.useCallback(
    (next: Partial<PreviewPayload>) => {
      onPreviewChange?.({
        orgName: next.orgName ?? orgName,
        logoDataUrl: next.logoDataUrl !== undefined ? next.logoDataUrl : logoDataUrl,
        primaryColor: normalizeHex(next.primaryColor ?? color),
      });
    },
    [color, logoDataUrl, onPreviewChange, orgName],
  );

  const pickLogo = async () => {
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
    publishPreview({ logoDataUrl: nextLogo });
  };

  const applyColor = (next: string) => {
    const normalized = normalizeColorInput(next);
    if (!normalized.startsWith('#') && !normalized.startsWith('rgb(') && !normalized.startsWith('hsl(')) {
      setColor(normalized);
      return;
    }
    const resolved = normalizeHex(normalized);
    setColor(resolved);
    publishPreview({ primaryColor: resolved });
  };

  const previewColor = normalizeHex(color);
  const previewOrgName = orgName.trim() || BRANDING_DEFAULTS.orgName;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={[styles.grid, { gap: spacing.lg }]}>
        <View style={[styles.col, { gap: spacing.md }]}>
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
                onPress={() => void pickLogo()}
                style={[
                  styles.logoButton,
                  {
                    borderRadius: controlRadius,
                    borderColor: colors.border,
                    borderStyle: 'dashed',
                    backgroundColor: colors.surfaceMuted,
                  },
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
                  onPress={() => void pickLogo()}
                  style={({ pressed }) => [
                    styles.iconAction,
                    {
                      borderRadius: controlRadius,
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    },
                  ]}>
                  <Upload size={18} color={colors.primary} strokeWidth={2} />
                </Pressable>
                {logoDataUrl ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.branding.logoRemove.a11y')}
                    onPress={() => {
                      setLogoDataUrl(null);
                      publishPreview({ logoDataUrl: null });
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
              publishPreview({ orgName: value });
            }}
          />

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
                      onPress={() => applyColor(preset)}
                      style={[
                        styles.preset,
                        {
                          borderColor: selected ? colors.text : colors.border,
                          backgroundColor: preset,
                          borderRadius: surfaceRadius.button,
                        },
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
          <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('settings.branding.livePreview')}</Text>
          <View
            style={[
              styles.previewCard,
              {
                borderColor: colors.border,
                borderRadius: panelRadius,
                overflow: 'hidden',
                minHeight: 180,
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
                  <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1 }]} numberOfLines={1}>
                    {previewOrgName}
                  </Text>
                </View>
              </View>
              <View style={{ padding: spacing.sm, gap: spacing.sm }}>
                <AppButton
                  label={t('settings.branding.primaryButton')}
                  onPress={() => undefined}
                  size="compact"
                  variant="cta"
                />
                <Text style={[typography.caption, { color: colors.textMuted }]}>
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
        onReset={() => onReset?.()}
        onSave={() => onSave({ orgName: orgName.trim(), logoDataUrl, primaryColor: previewColor })}
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
  previewCard: {
    borderWidth: 1,
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
