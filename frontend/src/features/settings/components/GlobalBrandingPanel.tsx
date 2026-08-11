import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SETTINGS_COPY } from '@/features/settings/data/settings.copy';
import type { WorkspaceBranding } from '@/features/settings/types/settings.types';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import {
  AppColorFieldInput,
  AppColorFieldPickerTrigger,
  AppColorFieldRoot,
} from '@/shared/components/app-color-field';
import { AppSecondaryButton } from '@/shared/components/app-secondary-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { BrandingLogo } from '@/shared/components/branding-logo';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { normalizeHex } from '@/shared/utils/color-picker';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type PreviewPayload = WorkspaceBranding & { primaryColor: string };

type Props = {
  branding: WorkspaceBranding;
  primaryColor: string;
  backgroundTheme: 'geometric' | 'simple';
  saving?: boolean;
  onBackgroundThemeChange: (theme: 'geometric' | 'simple') => void;
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
  backgroundTheme,
  saving = false,
  onBackgroundThemeChange,
  onSave,
  onPreviewChange,
  onReset,
}: Props) {
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } = useAppTheme();
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
            <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('settings.branding.logoUpload')}</Text>
            <View style={[styles.logoRow, { gap: spacing.sm }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upload logo"
                onPress={() => void pickLogo()}
                style={[styles.logoButton, { borderRadius: controlRadius }]}>
                <BrandingLogo
                  logoDataUrl={logoDataUrl}
                  size={80}
                  color={colors.textOnPrimary}
                  backgroundColor={previewColor}
                  borderRadius={controlRadius}
                  variant="user"
                />
              </Pressable>
              {logoDataUrl ? (
                <AppSecondaryButton
                  label={t('settings.branding.logoRemove')}
                  onPress={() => {
                    setLogoDataUrl(null);
                    publishPreview({ logoDataUrl: null });
                  }}
                />
              ) : null}
            </View>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{t('settings.branding.logoHint')}</Text>
          </View>

          <AppTextField
            label={t('settings.branding.orgName')}
            value={orgName}
            onChangeText={(value) => {
              setOrgName(value);
              publishPreview({ orgName: value });
            }}
          />

          <AppSelectField
            label={t('settings.branding.backgroundTheme')}
            value={backgroundTheme}
            options={[
              { key: 'geometric', label: t('settings.branding.backgroundTheme.geometric') },
              { key: 'simple', label: t('settings.branding.backgroundTheme.simple') },
            ]}
            onChange={(value) => onBackgroundThemeChange(value as 'geometric' | 'simple')}
            accessibilityLabel={t('settings.branding.backgroundTheme')}
          />

          <AppColorFieldRoot label="" value={color} onChange={applyColor}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('settings.branding.primaryColor')}</Text>
              <AppColorFieldInput showLabel={false} />
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('settings.branding.themePresets')}</Text>
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
                <AppColorFieldPickerTrigger size={{ width: 70, height: 32 }} />
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
                backgroundColor: colors.surface,
              },
            ]}>
            <View style={[styles.previewHeader, { gap: spacing.sm }]}>
              <BrandingLogo
                logoDataUrl={logoDataUrl}
                size={32}
                color={colors.textOnPrimary}
                backgroundColor={previewColor}
                borderRadius={controlRadius}
                variant="user"
              />
              <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{previewOrgName}</Text>
            </View>
            <View style={[styles.previewButton, { backgroundColor: previewColor, borderRadius: controlRadius }]}>
              <Text style={[typography.body, { color: colors.textOnPrimary, fontWeight: '500' }]}>
                {t('settings.branding.primaryButton')}
              </Text>
            </View>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{t('settings.branding.previewDescription')}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.actions, { gap: spacing.sm, paddingTop: spacing.lg }]}>
        {onReset ? <AppSecondaryButton label={t('settings.actions.reset')} onPress={onReset} disabled={saving} /> : null}
        <AppButton
          label={saving ? t('common.saving') : t('settings.actions.saveChanges')}
          onPress={() => onSave({ orgName: orgName.trim(), logoDataUrl, primaryColor: previewColor })}
          loading={saving}
        />
      </View>
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
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  logoButton: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  preset: {
    width: 70,
    height: 32,
    borderWidth: 1,
  },
  previewCard: {
    borderWidth: 1,
    padding: 16,
    gap: 16,
    minHeight: 200,
    justifyContent: 'flex-start',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewLogo: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewLogoImage: {
    width: '100%',
    height: '100%',
  },
  previewButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
});
