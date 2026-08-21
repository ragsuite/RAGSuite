import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Palette } from 'lucide-react-native';

import { useAppChatWidget } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import { gradientPoints } from '@/features/app-chat-widget/utils/app-chat-widget-display';
import { ChatWidgetPreview } from '@/features/chatbot-config/components/ChatWidgetPreview';
import { ChatbotConfigPreviewLayout } from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { resolveAvatarAssetUrl, prepareChatWidgetCustomizationForSave } from '@/features/chatbot-config/utils/widget-avatar-display';
import {
  buildCustomGradientString,
  CHATBOT_COLOR_SWATCHES,
  DEFAULT_GRADIENT_ANGLE,
  DEFAULT_GRADIENT_COLOR1,
  DEFAULT_GRADIENT_COLOR2,
  parseCustomGradient,
  resolveWidgetChatbotColor,
  suggestTextColorForBackground,
  DEFAULT_WIDGET_CHATBOT_COLOR,
} from '@/features/chatbot-config/utils/widget-theme-utils';
import { brandTokens } from '@/theme/brand-tokens';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppColorField, AppColorFieldPickerTrigger, AppColorFieldRoot } from '@/shared/components/app-color-field';
import { AppRangeField } from '@/shared/components/app-range-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

const GRADIENT_DIVIDER = { borderTopWidth: 1 } as const;

function ColorSwatchRow({
  widgetChatbotColor,
  onSelect,
}: {
  widgetChatbotColor: string;
  onSelect: (value: string) => void;
}) {
  const { colors, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  return (
    <View style={styles.swatches}>
      {CHATBOT_COLOR_SWATCHES.map((swatch) => {
        const selected = widgetChatbotColor === swatch.value;
        const borderColor = selected ? colors.primary : colors.border;

        if ('gradient' in swatch && swatch.gradient) {
          return (
            <Pressable
              key={swatch.id}
              accessibilityRole="button"
              accessibilityLabel="Apply gradient preset"
              onPress={() => onSelect(swatch.value)}
              style={[styles.swatchOuter, { borderColor, borderWidth: selected ? 2 : 1, borderRadius: controlRadius }]}>
              <LinearGradient
                colors={[...swatch.gradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.swatchInner, { borderRadius: controlRadius }]}
              />
              {selected ? (
                <View style={[styles.swatchCheckWrap, { borderRadius: controlRadius }]}>
                  <Check size={16} color={colors.textOnPrimary} />
                </View>
              ) : null}
            </Pressable>
          );
        }

        const solidColor = 'color' in swatch ? swatch.color : DEFAULT_WIDGET_CHATBOT_COLOR;
        return (
          <Pressable
            key={swatch.id}
            accessibilityRole="button"
            accessibilityLabel={`Set color ${solidColor}`}
            onPress={() => onSelect(swatch.value)}
            style={[styles.swatchOuter, { borderColor, borderWidth: selected ? 2 : 1, borderRadius: controlRadius }]}>
            <View style={[styles.swatchInner, { backgroundColor: solidColor, borderRadius: controlRadius }]} />
            {selected ? (
              <View style={[styles.swatchCheckWrap, { borderRadius: controlRadius }]}>
                <Check size={16} color={colors.textOnPrimary} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <AppColorFieldPickerTrigger size={40} />
    </View>
  );
}
function PositionCornerIcon({ side }: { side: 'left' | 'right' }) {
  const { colors } = useAppTheme();
  const bubbleSide = side === 'left' ? 'flex-start' : 'flex-end';
  return (
    <View
      style={[
        styles.positionIconFrame,
        { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
      ]}>
      <View style={[styles.positionIconBubble, { alignSelf: bubbleSide, backgroundColor: colors.primary }]} />
    </View>
  );
}

type AvatarChipPressState = { pressed: boolean; hovered?: boolean };

function avatarChipMotion(state: AvatarChipPressState, kind: 'preset' | 'add' | 'remove' = 'preset') {
  const hovered = Boolean(state.hovered);
  const pressed = state.pressed;
  const hoverScale = kind === 'preset' ? 1.05 : 1.08;
  const pressScale = kind === 'preset' ? 0.94 : 0.92;
  return {
    transform: [{ scale: pressed ? pressScale : hovered ? hoverScale : 1 }],
    opacity: pressed ? 0.88 : 1,
  };
}

export function ChatWidgetCustomizationPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, radius } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const inputRadius = surfaceRadius.input;
  const panelRadius = surfaceRadius.card;
  const { bundle, saving, handleSaveChatWidgetCustomization } = useChatbotConfig();
  const { syncFromBundle } = useAppChatWidget();
  const { isCompact, isNativeMobile } = useChatbotConfigLayout();
  const [draft, setDraft] = useState<ChatWidgetCustomization | null>(null);
  const [gradientColor1, setGradientColor1] = useState<string>(DEFAULT_GRADIENT_COLOR1);
  const [position, setPosition] = useState<ChatWidgetConfig['position']>('bottom-right');
  const config = bundle?.chatWidgetConfig;
  const avatarOptions = bundle?.avatarOptions ?? [];
  const defaultAvatarId = avatarOptions[0]?.id ?? 'default-1';

  useEffect(() => {
    if (bundle?.chatWidgetCustomization) {
      const next = {
        ...bundle.chatWidgetCustomization,
        avatarUrl: bundle.chatWidgetCustomization.avatarUrl ?? null,
        customWidthEnabled: bundle.chatWidgetCustomization.customWidthEnabled ?? true,
        widgetWidth: bundle.chatWidgetCustomization.widgetWidth ?? 400,
        customHeightEnabled: bundle.chatWidgetCustomization.customHeightEnabled ?? true,
        widgetHeight: bundle.chatWidgetCustomization.widgetHeight ?? 600,
        panelBorderRadius: bundle.chatWidgetCustomization.panelBorderRadius ?? 20,
        showBackdrop: bundle.chatWidgetCustomization.showBackdrop ?? false,
        textColor: bundle.chatWidgetCustomization.textColor ?? brandTokens.color.paperRaised,
      };
      setDraft(next);

      const parsed = parseCustomGradient(next.primaryColor);
      setGradientColor1(parsed?.color1 ?? DEFAULT_GRADIENT_COLOR1);
    }
    if (bundle?.chatWidgetConfig) setPosition(bundle.chatWidgetConfig.position);
  }, [bundle?.chatWidgetCustomization, bundle?.chatWidgetConfig]);

  const updateBackgroundColor = (backgroundColor: string) => {
    setDraft((prev) => (prev ? { ...prev, backgroundColor } : prev));
  };

  const updateBackgroundColorFromPicker = (backgroundColor: string) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            backgroundColor,
            textColor: suggestTextColorForBackground(backgroundColor),
          }
        : prev,
    );
  };

  const previewConfig = config ? { ...config, position } : null;
  const widgetChatbotColor = draft ? resolveWidgetChatbotColor(draft.primaryColor) : '';
  const gradientPreview = useMemo(() => {
    if (!draft) return null;
    return gradientPoints(draft.gradientAngle ?? DEFAULT_GRADIENT_ANGLE);
  }, [draft?.gradientAngle]);

  const previewCustomization = useMemo(() => {
    if (!draft) return null;
    if (draft.primaryColor.startsWith('linear-gradient')) {
      return {
        ...draft,
        primaryColor: buildCustomGradientString(
          gradientColor1,
          draft.secondaryColor || DEFAULT_GRADIENT_COLOR2,
          draft.gradientAngle ?? DEFAULT_GRADIENT_ANGLE,
        ),
        headerColor: buildCustomGradientString(
          gradientColor1,
          draft.secondaryColor || DEFAULT_GRADIENT_COLOR2,
          draft.gradientAngle ?? DEFAULT_GRADIENT_ANGLE,
        ),
      };
    }
    return draft;
  }, [draft, gradientColor1]);

  const applyGradient = () => {
    if (!draft) return;
    const gradient = buildCustomGradientString(
      gradientColor1,
      draft.secondaryColor || DEFAULT_GRADIENT_COLOR2,
      draft.gradientAngle ?? DEFAULT_GRADIENT_ANGLE,
    );
    setDraft({
      ...draft,
      primaryColor: gradient,
      headerColor: gradient,
    });
  };

  const selectWidgetChatbotColor = (value: string) => {
    setDraft((prev) => (prev ? { ...prev, primaryColor: value, headerColor: value } : prev));
  };

  const clearLogo = () => {
    setDraft((prev) => (prev ? { ...prev, logoUrl: null } : prev));
  };

  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setDraft((prev) => (prev ? { ...prev, logoUrl: result.assets[0].uri } : prev));
    }
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setDraft((prev) =>
        prev ? { ...prev, avatarId: 'custom', avatarUrl: result.assets[0].uri } : prev,
      );
    }
  };

  const clearAvatar = () => {
    setDraft((prev) => (prev ? { ...prev, avatarId: defaultAvatarId, avatarUrl: null } : prev));
  };

  const onSave = async () => {
    if (!draft || !config) return;
    const nextConfig = { ...config, position };
    const preparedDraft = await prepareChatWidgetCustomizationForSave(draft);
    await handleSaveChatWidgetCustomization(preparedDraft, nextConfig);
    setDraft(preparedDraft);
    syncFromBundle({
      config: nextConfig,
      customization: preparedDraft,
      collectFeedback: bundle?.feedbackSettings.collectFeedback ?? true,
      avatarOptions,
    });
  };

  return (
    <StatePanel isEmpty={!draft || !previewConfig} emptyLabel={t('chatbot.widget.customisation.unavailable')}>
      {draft && previewConfig && previewCustomization && gradientPreview ? (
          <ChatbotConfigPreviewLayout
            preview={
              <ChatWidgetPreview
                config={previewConfig}
                customization={previewCustomization}
                avatarOptions={avatarOptions}
              />
            }
            form={
            <SearchConfigPanelCard
              icon={Palette}
              title={t('chatbot.settings.customisation')}
              subtitle={t('chatbot.widget.customisation.subtitle')}>
            <View style={{ gap: spacing.md }}>
              <SectionCard title={t('chatbot.widget.logo.title')} subtitle={t('chatbot.widget.logo.subtitle')}>
                <View style={{ gap: spacing.sm }}>
                  <View style={[styles.uploadRow, { borderColor: colors.border, borderRadius: panelRadius }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Upload widget logo"
                      onPress={() => void pickLogo()}
                      style={({ pressed }) => [
                        styles.chooseFileBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                        },
                      ]}>
                      <ActionIcons.upload size={14} color={colors.textMuted} />
                      <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
                        {t('chatbot.widget.logo.chooseFile')}
                      </Text>
                    </Pressable>
                    <View style={styles.fileNameWrap}>
                      <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                        {draft.logoUrl ? 'image.png' : t('chatbot.widget.logo.noFileSelected')}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove logo"
                      onPress={clearLogo}
                      disabled={!draft.logoUrl}
                      style={({ pressed }) => [
                        styles.removeLogoBtn,
                        { opacity: draft.logoUrl ? (pressed ? 0.72 : 1) : 0.35, borderRadius: controlRadius },
                      ]}>
                      <ActionIcons.delete size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                  <View style={[styles.logoPreviewRow, { gap: spacing.sm }]}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>{t('chatbot.widget.logo.preview')}</Text>
                    {draft.logoUrl ? (
                      <Image
                        source={{ uri: draft.logoUrl }}
                        style={[styles.logoPreview, { borderRadius: controlRadius, borderColor: colors.border }]}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.logoPlaceholder,
                          { borderRadius: controlRadius, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
                        ]}
                      />
                    )}
                  </View>
                </View>
              </SectionCard>

              <SectionCard title={t('chatbot.widget.avatar.title')} subtitle={t('chatbot.widget.avatar.subtitle')}>
                <View style={{ gap: spacing.sm }}>
                  <View style={[styles.avatarRow, { gap: spacing.sm }]}>
                    {avatarOptions.map((option) => {
                      const selected = draft.avatarId === option.id && !draft.avatarUrl;
                      return (
                        <Pressable
                          key={option.id}
                          accessibilityRole="button"
                          accessibilityLabel={option.name}
                          onPress={() =>
                            setDraft((prev) =>
                              prev ? { ...prev, avatarId: option.id, avatarUrl: null } : prev,
                            )
                          }
                          style={(state) => [
                            styles.avatarChoice,
                            {
                              borderColor: selected
                                ? colors.primary
                                : state.hovered
                                  ? colors.primary
                                  : colors.border,
                              borderWidth: selected || state.hovered ? 2 : 1,
                              borderRadius: radius.pill,
                              backgroundColor:
                                selected || state.hovered ? colors.surfaceMuted : colors.surface,
                              ...avatarChipMotion(state, 'preset'),
                            },
                          ]}>
                          <Image
                            source={{ uri: resolveAvatarAssetUrl(option.url) ?? option.url }}
                            style={styles.avatarImage}
                            contentFit="cover"
                            accessibilityLabel={option.name}
                          />
                        </Pressable>
                      );
                    })}
                    {draft.avatarUrl ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Custom uploaded avatar"
                        onPress={() => setDraft((prev) => (prev ? { ...prev, avatarId: 'custom' } : prev))}
                        style={(state) => [
                          styles.avatarChoice,
                          styles.avatarUploadChoice,
                          {
                            borderColor:
                              draft.avatarId === 'custom' || state.hovered
                                ? colors.primary
                                : colors.border,
                            borderWidth: draft.avatarId === 'custom' || state.hovered ? 2 : 1,
                            borderRadius: radius.pill,
                            ...avatarChipMotion(state, 'preset'),
                          },
                        ]}>
                        <Image
                          source={{ uri: draft.avatarUrl }}
                          style={styles.avatarImage}
                          contentFit="cover"
                        />
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Upload avatar image"
                      onPress={() => void pickAvatar()}
                      style={(state) => [
                        styles.avatarChoice,
                        styles.avatarAddBtn,
                        {
                          borderRadius: radius.pill,
                          borderColor: state.hovered || state.pressed ? colors.primary : colors.border,
                          borderWidth: state.hovered || state.pressed ? 2 : 1,
                          backgroundColor:
                            state.hovered || state.pressed ? colors.surface : colors.surfaceMuted,
                          ...avatarChipMotion(state, 'add'),
                        },
                      ]}>
                      {({ pressed, hovered }: AvatarChipPressState) => (
                        <ActionIcons.add
                          size={16}
                          color={pressed || hovered ? colors.primary : colors.textMuted}
                        />
                      )}
                    </Pressable>
                    {draft.avatarUrl ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove custom avatar"
                        onPress={clearAvatar}
                        style={(state) => [
                          styles.avatarChoice,
                          styles.avatarRemoveBtn,
                          {
                            borderRadius: radius.pill,
                            borderColor: colors.danger,
                            borderWidth: state.hovered || state.pressed ? 2 : 1,
                            backgroundColor: colors.dangerBackground,
                            ...avatarChipMotion(state, 'remove'),
                          },
                        ]}>
                        <ActionIcons.delete size={14} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </SectionCard>

              <SectionCard title={t('chatbot.widget.colour.title')} subtitle={t('chatbot.widget.colour.subtitle')}>
                <View style={{ gap: spacing.md }}>
                  <AppColorFieldRoot
                    label=""
                    value={widgetChatbotColor}
                    onChange={selectWidgetChatbotColor}>
                    <ColorSwatchRow
                      widgetChatbotColor={widgetChatbotColor}
                      onSelect={selectWidgetChatbotColor}
                    />
                  </AppColorFieldRoot>
                  <View
                    style={[
                      GRADIENT_DIVIDER,
                      { borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.md },
                    ]}>
                    <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
                      {t('chatbot.widget.colour.customGradient')}
                    </Text>
                    <LinearGradient
                      colors={[
                        gradientColor1,
                        draft.secondaryColor || DEFAULT_GRADIENT_COLOR2,
                      ]}
                      start={gradientPreview.start}
                      end={gradientPreview.end}
                      style={[styles.gradientBar, { borderRadius: controlRadius, borderColor: colors.border }]}
                      accessibilityLabel="Gradient preview"
                    />
                    <View
                      style={[
                        styles.colorFieldsRow,
                        isCompact ? styles.colorFieldsStack : null,
                        { gap: spacing.sm },
                      ]}>
                      <View style={styles.colorFieldCol}>
                        <AppColorField
                          label={t('chatbot.widget.colour.colour1')}
                          value={gradientColor1}
                          onChange={(hex) => setGradientColor1(hex)}
                          pickerTriggerPlacement="inline"
                        />
                      </View>
                      <View style={styles.colorFieldCol}>
                        <AppColorField
                          label={t('chatbot.widget.colour.colour2')}
                          value={draft.secondaryColor || DEFAULT_GRADIENT_COLOR2}
                          onChange={(secondaryColor) => setDraft((prev) => (prev ? { ...prev, secondaryColor } : prev))}
                          pickerTriggerPlacement="inline"
                        />
                      </View>
                    </View>
                    <AppRangeField
                      label={t('chatbot.widget.colour.angle')}
                      value={draft.gradientAngle ?? DEFAULT_GRADIENT_ANGLE}
                      min={0}
                      max={360}
                      step={1}
                      editable
                      formatValue={(v) => `${v}°`}
                      onChange={(gradientAngle) => setDraft((prev) => (prev ? { ...prev, gradientAngle } : prev))}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Apply gradient"
                      onPress={applyGradient}
                      style={({ pressed }) => [
                        styles.applyGradientBtn,
                        {
                          borderColor: colors.border,
                          borderRadius: controlRadius,
                          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                        },
                      ]}>
                      <Text style={[typography.body, { color: colors.primary, fontWeight: '500' }]}>
                        {t('chatbot.widget.colour.applyGradient')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </SectionCard>

              <SectionCard title={t('chatbot.widget.theme.title')}>
                <View style={{ gap: spacing.md }}>
                  <AppColorField
                    label={t('chatbot.widget.theme.backgroundLabel')}
                    value={draft.backgroundColor}
                    onChange={updateBackgroundColor}
                    onPickerChange={updateBackgroundColorFromPicker}
                    pickerTriggerPlacement="inline"
                  />
                  <AppColorField
                    label={t('chatbot.widget.theme.textColorLabel')}
                    value={draft.textColor}
                    onChange={(textColor) => setDraft((prev) => (prev ? { ...prev, textColor } : prev))}
                    pickerTriggerPlacement="inline"
                  />
                </View>
              </SectionCard>

              <SectionCard title={t('chatbot.widget.position.title')}>
                <View style={[styles.positionRow, { borderColor: colors.border, borderRadius: panelRadius }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Set position left"
                    onPress={() => setPosition('bottom-left')}
                    style={[
                      styles.positionBtn,
                      {
                        borderRightWidth: 1,
                        borderRightColor: colors.border,
                        backgroundColor: position === 'bottom-left' ? colors.primary : colors.surface,
                      },
                    ]}>
                    <PositionCornerIcon side="left" />
                    <Text
                      style={[
                        typography.body,
                        {
                          color: position === 'bottom-left' ? colors.textOnPrimary : colors.text,
                        },
                      ]}>
                      {t('chatbot.widget.position.left')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Set position right"
                    onPress={() => setPosition('bottom-right')}
                    style={[
                      styles.positionBtn,
                      { backgroundColor: position === 'bottom-right' ? colors.primary : colors.surface },
                    ]}>
                    <PositionCornerIcon side="right" />
                    <Text
                      style={[
                        typography.body,
                        {
                          color: position === 'bottom-right' ? colors.textOnPrimary : colors.text,
                        },
                      ]}>
                      {t('chatbot.widget.position.right')}
                    </Text>
                  </Pressable>
                </View>
              </SectionCard>

              <SectionCard title={t('chatbot.widget.options.title')}>
                <View style={{ gap: spacing.sm }}>
                  <AppSwitchRow
                    label={t('chatbot.widget.options.showLogo')}
                    bordered={false}
                    value={draft.showLogo}
                    onChange={(showLogo) => setDraft((prev) => (prev ? { ...prev, showLogo } : prev))}
                  />
                  <AppSwitchRow
                    label={t('chatbot.widget.options.showDateTime')}
                    bordered={false}
                    value={draft.showDateTime}
                    onChange={(showDateTime) => setDraft((prev) => (prev ? { ...prev, showDateTime } : prev))}
                  />
                  <AppSwitchRow
                    label={t('chatbot.widget.options.showBackdrop')}
                    bordered={false}
                    value={draft.showBackdrop}
                    onChange={(showBackdrop) => setDraft((prev) => (prev ? { ...prev, showBackdrop } : prev))}
                  />
                </View>
              </SectionCard>

              <SectionCard title={t('chatbot.widget.settings.title')}>
                <View style={{ gap: spacing.md }}>
                  <AppRangeField
                    label={t('chatbot.widget.settings.avatarSize', { count: draft.avatarSize })}
                    value={draft.avatarSize}
                    min={15}
                    max={100}
                    step={1}
                    formatValue={() => ''}
                    onChange={(avatarSize) => setDraft((prev) => (prev ? { ...prev, avatarSize } : prev))}
                  />
                  <AppRangeField
                    label={t('chatbot.widget.settings.bottomSpace', { count: draft.widgetBottomSpace })}
                    value={draft.widgetBottomSpace}
                    min={15}
                    max={200}
                    step={1}
                    formatValue={() => ''}
                    onChange={(widgetBottomSpace) =>
                      setDraft((prev) => (prev ? { ...prev, widgetBottomSpace } : prev))
                    }
                  />
                  <AppRangeField
                    label={t('chatbot.widget.settings.panelCornerRadius', {
                      count: draft.panelBorderRadius,
                    })}
                    value={draft.panelBorderRadius}
                    min={0}
                    max={28}
                    step={1}
                    formatValue={() => ''}
                    onChange={(panelBorderRadius) =>
                      setDraft((prev) => (prev ? { ...prev, panelBorderRadius } : prev))
                    }
                  />
                  <AppSwitchRow
                    label={t('chatbot.widget.settings.customWidth')}
                    bordered={false}
                    value={draft.customWidthEnabled}
                    onChange={(customWidthEnabled) =>
                      setDraft((prev) => (prev ? { ...prev, customWidthEnabled } : prev))
                    }
                  />
                  {draft.customWidthEnabled ? (
                    <AppRangeField
                      label={t('chatbot.widget.settings.width', { count: draft.widgetWidth })}
                      value={draft.widgetWidth}
                      min={320}
                      max={900}
                      step={1}
                      formatValue={() => ''}
                      onChange={(widgetWidth) => setDraft((prev) => (prev ? { ...prev, widgetWidth } : prev))}
                    />
                  ) : null}
                  <AppSwitchRow
                    label={t('chatbot.widget.settings.customHeight')}
                    bordered={false}
                    value={draft.customHeightEnabled}
                    onChange={(customHeightEnabled) =>
                      setDraft((prev) => (prev ? { ...prev, customHeightEnabled } : prev))
                    }
                  />
                  {draft.customHeightEnabled ? (
                    <AppRangeField
                      label={t('chatbot.widget.settings.height', { count: draft.widgetHeight })}
                      value={draft.widgetHeight}
                      min={360}
                      max={800}
                      step={1}
                      formatValue={() => ''}
                      onChange={(widgetHeight) =>
                        setDraft((prev) => (prev ? { ...prev, widgetHeight } : prev))
                      }
                    />
                  ) : null}
                </View>
              </SectionCard>

              <AppButton
                variant="cta"
                size="compact"
                label={t('chatbot.widget.save.label')}
                icon={ActionIcons.save}
                loading={saving}
                disabled={saving}
                onPress={() => void onSave()}
              />
            </View>
            </SearchConfigPanelCard>
            }
          />
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  swatchOuter: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchInner: {
    width: '100%',
    height: '100%',
  },
  swatchCheckWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  applyGradientBtn: {
    width: '100%',
    minHeight: CHATBOT_CONFIG_TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 10,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: CHATBOT_CONFIG_TOUCH_MIN,
  },
  chooseFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRightWidth: 1,
    paddingHorizontal: 12,
    minHeight: CHATBOT_CONFIG_TOUCH_MIN,
  },
  fileNameWrap: { flex: 1, paddingHorizontal: 10 },
  removeLogoBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  logoPreviewRow: { flexDirection: 'row', alignItems: 'center' },
  logoPreview: { width: 30, height: 30, borderWidth: 1 },
  logoPlaceholder: { width: 30, height: 30, borderWidth: 1 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  avatarChoice: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarUploadChoice: {
    overflow: 'hidden',
    padding: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarAddBtn: {
    borderStyle: 'dashed',
  },
  avatarRemoveBtn: {
    borderWidth: 1,
  },
  gradientBar: { height: 48, width: '100%', borderWidth: 1 },
  colorFieldsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  colorFieldsStack: { flexDirection: 'column', alignItems: 'stretch' },
  colorFieldCol: { flex: 1, minWidth: 0 },
  positionRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, overflow: 'hidden' },
  positionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: CHATBOT_CONFIG_TOUCH_MIN,
  },
  positionIconFrame: {
    width: 22,
    height: 16,
    borderWidth: 1,
    borderRadius: 3,
    justifyContent: 'flex-end',
    padding: 2,
  },
  positionIconBubble: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
});
