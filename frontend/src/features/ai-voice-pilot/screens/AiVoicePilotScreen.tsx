import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  ArrowRight,
  KeyRound,
  Mic,
  Play,
  Settings,
  Sparkles,
  Square,
  AudioLines,
  Speech,
} from 'lucide-react-native';

import { AudioReactiveOrb } from '@/features/ai-voice-pilot/components/AudioReactiveOrb';
import { CustomVoicesPanel } from '@/features/ai-voice-pilot/components/CustomVoicesPanel';
import { ElevenLabsVoicesPanel } from '@/features/ai-voice-pilot/components/ElevenLabsVoicesPanel';
import { SetupFieldTip } from '@/features/ai-voice-pilot/components/SetupFieldTip';
import { VoiceConfigurationWorkspace } from '@/features/ai-voice-pilot/components/VoiceConfigurationWorkspace';
import { themeFromPaletteIndex } from '@/features/ai-voice-pilot/components/audio-reactive-orb/orbShaders';
import { useVoicePilot } from '@/features/ai-voice-pilot/hooks/useVoicePilot';
import {
  useVoicePilotContentWidth,
  voicePanelIsNarrow,
} from '@/features/ai-voice-pilot/hooks/useVoicePilotContentWidth';
import type {
  VoicePilotPrimaryTab,
  VoicePilotProvider,
  VoicePilotSettingsUpdate,
} from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { saveChatWidgetCustomization } from '@/features/chatbot-config/services/chatbot-config.service';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useTranslation } from '@/i18n';
import { useWidgetCapabilities } from '@/platform/widget-capabilities';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useToast } from '@/shared/toast/use-toast';
import { genericFieldAutofillProps } from '@/shared/utils/search-input-autofill';
import { ProviderApiKeyConnectionHint } from '@/features/model-configuration/components/ProviderApiKeyConnectionHint';
import {
  formatApiKeyFieldDisplay,
  isMaskedApiKey,
} from '@/features/search-config/utils/search-settings-api';
import { sttLocaleSelectOptions } from '@/features/ai-voice-pilot/utils/stt-locales';
import { spherePaletteIndex } from '@/features/ai-voice-pilot/utils/voice-trending';

const voicePilotFieldAutofill = {
  ...genericFieldAutofillProps,
  autoComplete: 'new-password' as const,
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  spellCheck: false,
};

function stateLabel(
  state: string,
  t: (key: string) => string,
  agentActive?: boolean,
): string {
  switch (state) {
    case 'connecting':
      return t('voicePilot.state.connecting');
    case 'listening':
      return t('voicePilot.state.listening');
    case 'thinking':
      return t('voicePilot.state.thinking');
    case 'speaking':
      return t('voicePilot.state.speaking');
    case 'error':
      return t('voicePilot.state.error');
    default:
      return agentActive ? t('voicePilot.state.ready') : t('voicePilot.state.idle');
  }
}

export function AiVoicePilotScreen({
  embedded = false,
  /** When true, content sits inside Settings → Voice Pilot panel card (no nested panel headers). */
  settingsShell = false,
  hideSegmentTabs = false,
  primaryTab: primaryTabProp,
  onPrimaryTabChange,
}: {
  embedded?: boolean;
  settingsShell?: boolean;
  /** When true, segment tabs are rendered by the parent (Chatbot sticky header). */
  hideSegmentTabs?: boolean;
  primaryTab?: VoicePilotPrimaryTab;
  onPrimaryTabChange?: (tab: VoicePilotPrimaryTab) => void;
} = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces, mode } = useAppTheme();
  const isCompact = useCompactLayout();
  const { width: contentWidth, onLayout: onContentLayout } = useVoicePilotContentWidth();
  // Settings shell is often narrow while the browser window is wide — use measured panel width.
  // Do not stretch tabs full-width just because we are embedded (that broke the chip look).
  const panelNarrow = voicePanelIsNarrow(contentWidth) || isCompact;
  const useCompactPrimaryTabs = panelNarrow && contentWidth > 0 && contentWidth < 420;
  const { isWeb, contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const resolvedHorizontalPadding = horizontalPadding ?? (isCompact ? spacing.sm : spacing.md);
  const tabRadius = surfaceRadius.button;
  const vp = useVoicePilot();
  const { hasVoicePilot } = useWidgetCapabilities();
  const {
    bundle,
    refresh: refreshChatbotConfig,
    setPrimaryTab: setChatbotPrimaryTab,
    setSettingsSection: setChatbotSettingsSection,
  } = useChatbotConfig();
  const [providerDraft, setProviderDraft] = useState<VoicePilotProvider>('elevenlabs');
  const [autoListenDraft, setAutoListenDraft] = useState(false);
  const [orbNameDraft, setOrbNameDraft] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const widgetVoiceEnabled = Boolean(bundle?.chatWidgetCustomization?.voicePilotEnabled);
  const inSettingsShell = embedded && settingsShell;
  const draftIsCustom = providerDraft === 'custom';

  const activePrimaryTab = primaryTabProp ?? vp.primaryTab;
  const setActivePrimaryTab = (tab: VoicePilotPrimaryTab) => {
    onPrimaryTabChange?.(tab);
    vp.setPrimaryTab(tab);
  };

  useEffect(() => {
    if (primaryTabProp == null) return;
    if (primaryTabProp !== vp.primaryTab) {
      vp.setPrimaryTab(primaryTabProp);
    }
  }, [primaryTabProp, vp.primaryTab, vp.setPrimaryTab]);

  useEffect(() => {
    if (!vp.settings) return;
    setProviderDraft(vp.settings.voice_provider === 'custom' ? 'custom' : 'elevenlabs');
    setAutoListenDraft(Boolean(vp.settings.auto_listen_after_reply));
    setApiKeyEditing(false);
  }, [vp.settings]);

  useEffect(() => {
    const customization = bundle?.chatWidgetCustomization;
    if (!customization) return;
    setOrbNameDraft(customization.voicePilotOrbName ?? '');
  }, [bundle?.chatWidgetCustomization]);

  const saveSetup = async () => {
    if (!vp.canSettings || setupSaving || vp.saving) return;
    setSetupSaving(true);
    try {
      const payload: VoicePilotSettingsUpdate = {
        voice_provider: providerDraft,
        stt_locale: vp.localeDraft.trim() || 'en-US',
        auto_listen_after_reply: autoListenDraft,
      };
      if (providerDraft === 'elevenlabs' && vp.apiKeyDraft.trim()) {
        payload.elevenlabs_api_key = vp.apiKeyDraft.trim();
      }
      await vp.saveSettings(payload, { toastOnSuccess: 'none' });

      if (hasVoicePilot && bundle?.chatWidgetCustomization) {
        try {
          await saveChatWidgetCustomization({
            ...bundle.chatWidgetCustomization,
            voicePilotProvider: providerDraft,
            voicePilotOrbName: orbNameDraft,
          });
          await refreshChatbotConfig();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : t('voicePilot.toast.saveFailed');
          toast({
            title: t('voicePilot.toast.saveFailed'),
            description: message,
            variant: 'destructive',
          });
          return;
        }
      }

      toast({ title: t('voicePilot.toast.settingsSaved') });
    } catch {
      /* voice settings errors already toasted by saveSettings */
    } finally {
      setSetupSaving(false);
    }
  };

  const workspaceStyle = useMemo(
    () =>
      embedded
        ? { gap: spacing.md, width: '100%' as const }
        : {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surface,
            padding: spacing.md,
            gap: spacing.md,
          },
    [colors.border, colors.surface, embedded, spacing.md, surfaceRadius.card],
  );

  const tabs = useMemo(
    () =>
      [
        { key: 'pilot' as const, label: t('voicePilot.tabs.pilot'), icon: Mic, visible: vp.canUse },
        { key: 'voices' as const, label: t('voicePilot.tabs.voices'), icon: Speech, visible: vp.canUse },
        {
          key: 'settings' as const,
          label: t('voicePilot.tabs.settings'),
          icon: Settings,
          visible: vp.canSettings || vp.canUse,
        },
      ].filter((tab) => tab.visible),
    [t, vp.canSettings, vp.canUse],
  );

  if (!vp.projectId) {
    const empty = (
      <EmptyStateView title={t('voicePilot.noProject.title')} description={t('voicePilot.noProject.body')} />
    );
    if (embedded) return empty;
    return (
      <View style={[styles.root, { backgroundColor: colors.background, padding: spacing.md }]}>{empty}</View>
    );
  }

  if (!vp.canUse && !vp.canSettings) {
    const empty = (
      <EmptyStateView title={t('voicePilot.forbidden.title')} description={t('voicePilot.forbidden.body')} />
    );
    if (embedded) return empty;
    return (
      <View style={[styles.root, { backgroundColor: colors.background, padding: spacing.md }]}>{empty}</View>
    );
  }

  const header = (
    <>
      {!isCompact && !embedded ? (
        <PageSectionHeader title={t('voicePilot.title')} subtitle={t('voicePilot.subtitle')} />
      ) : null}
      {hideSegmentTabs ? null : (
      <View
        onLayout={onContentLayout}
        style={[
          styles.primaryTabRow,
          { gap: spacing.xs },
          useCompactPrimaryTabs ? styles.primaryTabRowCompact : null,
        ]}>
        {tabs.map((tab) => {
          const active = activePrimaryTab === tab.key;
          const Icon = tab.icon;
          const chromeIdle = getWebParityTabStyle({
            active,
            pressed: false,
            colors,
            surfaceRadius,
            brandRadius: tabRadius,
            useWebParity: isWebParitySurfaces,
            colorMode: mode,
          });
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('voicePilot.primaryTab.a11y', { label: tab.label })}
              onPress={() => setActivePrimaryTab(tab.key as VoicePilotPrimaryTab)}
              style={({ pressed, hovered }) => {
                const chrome = getWebParityTabStyle({
                  active,
                  pressed,
                  hovered,
                  colors,
                  surfaceRadius,
                  brandRadius: tabRadius,
                  useWebParity: isWebParitySurfaces,
                  colorMode: mode,
                });
                return [
                  styles.primaryTabBtn,
                  useCompactPrimaryTabs ? styles.primaryTabBtnCompact : null,
                  getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                  {
                    paddingHorizontal: useCompactPrimaryTabs ? spacing.xs : spacing.sm,
                    gap: useCompactPrimaryTabs ? 4 : spacing.xs,
                  },
                ];
              }}>
              <Icon size={14} color={chromeIdle.textColor} />
              <Text
                numberOfLines={1}
                style={[
                  typography.caption,
                  useCompactPrimaryTabs ? styles.primaryTabLabelCompact : null,
                  getWebParityTabLabelStyle(chromeIdle.textColor, typography.caption),
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      )}
    </>
  );

  const showSessionControls =
    vp.agentActive ||
    vp.sessionState === 'connecting' ||
    vp.sessionState === 'listening' ||
    vp.sessionState === 'thinking' ||
    vp.sessionState === 'speaking';

  const hasDraftKey =
    Boolean(vp.apiKeyDraft.trim()) && !isMaskedApiKey(vp.apiKeyDraft.trim());
  const hasSavedApiKey = Boolean(vp.settings?.has_api_key);
  const savedKeyDisplay = hasSavedApiKey
    ? formatApiKeyFieldDisplay(vp.settings?.api_key_masked)
    : '';
  const showingSavedMask = hasSavedApiKey && !hasDraftKey && !apiKeyEditing;
  const apiKeyFieldValue = showingSavedMask ? savedKeyDisplay : vp.apiKeyDraft;

  const body = (
    <View style={{ width: '100%' }} onLayout={onContentLayout}>
      {vp.loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

        {!vp.loading && activePrimaryTab === 'pilot' ? (
          <View style={[workspaceStyle, { alignItems: 'center' }]}>
            <View style={{ gap: spacing.md, alignItems: 'center', paddingVertical: spacing.sm, width: '100%' }}>
              {!vp.isCustomProvider && !vp.settings?.has_api_key ? (
                <EmptyStateView
                  title={t('voicePilot.setup.keyTitle')}
                  description={t('voicePilot.setup.keyBody')}
                  variant="inline"
                  compact
                  actionLabel={t('voicePilot.actions.goToSettings')}
                  onAction={() => setActivePrimaryTab('settings')}
                />
              ) : !vp.settings?.selected_voice_id ? (
                <EmptyStateView
                  title={t('voicePilot.setup.voiceTitle')}
                  description={
                    vp.isCustomProvider
                      ? t('voicePilot.setup.customVoiceBody')
                      : t('voicePilot.setup.voiceBody')
                  }
                  variant="inline"
                  compact
                  actionLabel={t('voicePilot.actions.goToVoices')}
                  onAction={() => setActivePrimaryTab('voices')}
                />
              ) : null}

              {vp.error ? (
                <View
                  style={[
                    styles.inlineError,
                    {
                      backgroundColor: colors.dangerBackground ?? 'rgba(185,28,28,0.08)',
                      borderColor: colors.danger,
                      borderRadius: surfaceRadius.button,
                    },
                  ]}>
                  <Text style={[typography.body, { color: colors.danger, textAlign: 'center' }]}>
                    {vp.error}
                  </Text>
                </View>
              ) : null}

              {vp.settings?.selected_voice_id ? (
                <View style={styles.orbStage}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={stateLabel(vp.sessionState, t, vp.agentActive)}
                    onPress={vp.onMicPress}
                    style={({ pressed }) => [
                      styles.orbHit,
                      {
                        opacity: pressed ? 0.92 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      },
                    ]}>
                    <AudioReactiveOrb
                      size={168}
                      colorTheme={themeFromPaletteIndex(
                        spherePaletteIndex(vp.settings.selected_voice_id),
                      )}
                      bands={vp.orbBands}
                      state={vp.orbVisualState}
                      intensity={0.55 + vp.orbIntensity * 0.45}
                      quality="high"
                      priority={120}
                    />
                    {vp.sessionState === 'thinking' || vp.sessionState === 'connecting' ? (
                      <View style={styles.orbOverlay} pointerEvents="none">
                        <ActivityIndicator color={colors.primary} />
                      </View>
                    ) : null}
                  </Pressable>

                  <View style={[styles.sessionControls, { gap: spacing.sm }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('voicePilot.actions.startConversation')}
                      disabled={vp.agentActive}
                      onPress={() => {
                        if (!vp.agentActive) vp.onMicPress();
                      }}
                      style={({ pressed }) => [
                        styles.sessionIconBtn,
                        {
                          borderColor: colors.primary,
                          backgroundColor: vp.agentActive
                            ? colors.surfaceMuted
                            : pressed
                              ? colors.primaryPressed ?? colors.primary
                              : colors.primary,
                          borderRadius: surfaceRadius.button,
                          opacity: vp.agentActive ? 0.45 : 1,
                        },
                      ]}>
                      <Play
                        size={18}
                        color={vp.agentActive ? colors.textMuted : colors.textOnPrimary}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('voicePilot.actions.stopConversation')}
                      disabled={!showSessionControls}
                      onPress={() => vp.endAgentSession()}
                      style={({ pressed }) => [
                        styles.sessionIconBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                          borderRadius: surfaceRadius.button,
                          opacity: showSessionControls ? 1 : 0.45,
                        },
                      ]}>
                      <Square
                        size={16}
                        color={showSessionControls ? colors.danger : colors.textMuted}
                        fill={showSessionControls ? colors.danger : colors.textMuted}
                      />
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {vp.settings?.selected_voice_id ? (
                <Text
                  style={[
                    typography.subtitle,
                    {
                      color: colors.textMuted,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      textAlign: 'center',
                    },
                  ]}>
                  {stateLabel(vp.sessionState, t, vp.agentActive)}
                </Text>
              ) : null}

              {vp.settings?.selected_voice_name ? (
                <Text style={[typography.caption, { color: colors.textSoft, textAlign: 'center' }]}>
                  {vp.settings.selected_voice_name}
                </Text>
              ) : null}

              {vp.interimTranscript ? (
                <Text style={[typography.body, { color: colors.textSoft, textAlign: 'center' }]}>
                  {vp.interimTranscript}
                </Text>
              ) : null}

              {vp.settings?.selected_voice_id && !widgetVoiceEnabled ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('voicePilot.actions.enableOnWidget.a11y')}
                  onPress={() => {
                    setChatbotPrimaryTab('settings');
                    setChatbotSettingsSection('widget-config');
                  }}
                  style={({ pressed, hovered }) => [
                    styles.widgetHint,
                    panelNarrow ? styles.widgetHintStacked : null,
                    {
                      borderColor: pressed || hovered ? colors.primary : colors.border,
                      backgroundColor:
                        pressed || hovered ? colors.primaryTint : colors.surface,
                      borderRadius: surfaceRadius.button,
                      gap: spacing.sm,
                      maxWidth: 420,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      width: '100%',
                    },
                  ]}>
                  <View
                    style={[
                      styles.widgetHintIcon,
                      {
                        backgroundColor: colors.primaryTint,
                        borderRadius: surfaceRadius.button,
                      },
                    ]}>
                    <AudioLines size={16} color={colors.primary} />
                  </View>
                  <View style={styles.widgetHintCopy}>
                    <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>
                      {t('voicePilot.setup.enableWidgetTitle')}
                    </Text>
                    <Text
                      style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}
                      numberOfLines={2}>
                      {t('voicePilot.setup.enableWidgetBody')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.widgetHintCta,
                      panelNarrow ? styles.widgetHintCtaStacked : null,
                      {
                        backgroundColor: colors.primary,
                        borderRadius: surfaceRadius.button,
                        gap: spacing.xxs,
                      },
                    ]}>
                    <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '600' }]}>
                      {t('voicePilot.actions.enableOnWidget')}
                    </Text>
                    <ArrowRight size={14} color={colors.textOnPrimary} />
                  </View>
                </Pressable>
              ) : null}

              {vp.lastTranscript || vp.lastAnswer ? (
                <View style={{ width: '100%', gap: spacing.sm }}>
                  {vp.lastTranscript ? (
                    <View style={{ gap: spacing.xxs }}>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        {t('voicePilot.lastQuestion')}
                      </Text>
                      <Text style={[typography.body, { color: colors.text }]}>{vp.lastTranscript}</Text>
                    </View>
                  ) : null}
                  {vp.lastAnswer ? (
                    <View style={{ gap: spacing.xxs }}>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        {t('voicePilot.lastAnswer')}
                      </Text>
                      <Text style={[typography.body, { color: colors.textSoft }]}>{vp.lastAnswer}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {!vp.speechSupported ? (
                <Text style={[typography.caption, { color: colors.danger, textAlign: 'center' }]}>
                  {t('voicePilot.speechUnsupported')}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {!vp.loading && activePrimaryTab === 'voices' ? (
          <View style={inSettingsShell ? { gap: spacing.md, width: '100%' } : workspaceStyle}>
            {(() => {
              const inner = (
              <View style={{ gap: spacing.md }}>
                {vp.error ? (
                  <View
                    style={[
                      styles.inlineError,
                      {
                        backgroundColor: colors.dangerBackground ?? 'rgba(185,28,28,0.08)',
                        borderColor: colors.danger,
                        borderRadius: surfaceRadius.button,
                      },
                    ]}>
                    <Text style={[typography.body, { color: colors.danger }]}>{vp.error}</Text>
                  </View>
                ) : null}

                {!vp.isCustomProvider && !vp.settings?.has_api_key ? (
                  <EmptyStateView
                    title={t('voicePilot.setup.keyTitle')}
                    description={t('voicePilot.setup.keyBody')}
                    variant="inline"
                    actionLabel={t('voicePilot.actions.goToSettings')}
                    onAction={() => setActivePrimaryTab('settings')}
                  />
                ) : vp.isCustomProvider ? (
                  vp.voices.length === 0 ? (
                    <EmptyStateView
                      title={t('voicePilot.custom.emptyTitle')}
                      description={t('voicePilot.custom.emptyBody')}
                      variant="inline"
                    />
                  ) : (
                    <>
                      {vp.voiceConfigMode && vp.configVoice ? (
                        <VoiceConfigurationWorkspace
                          voice={vp.configVoice}
                          voiceIndex={
                            vp.configVoiceIndex >= 0
                              ? vp.configVoiceIndex
                              : vp.voiceCarouselIndex
                          }
                          voiceCount={vp.voices.length}
                          draft={vp.draftVoiceConfig}
                          hasUnsaved={vp.hasUnsavedVoiceConfig}
                          applying={vp.applyingVoiceConfig}
                          previewBusy={vp.previewBusy}
                          playing={
                            vp.playingVoiceId === vp.configVoice.voice_id && vp.playbackPlaying
                          }
                          isPaused={
                            vp.playingVoiceId === vp.configVoice.voice_id && vp.playbackPaused
                          }
                          isSelected={vp.settings?.selected_voice_id === vp.configVoice.voice_id}
                          orbBands={vp.orbBands}
                          orbState={
                            vp.playingVoiceId === vp.configVoice.voice_id && vp.playbackPlaying
                              ? 'speaking'
                              : 'listening'
                          }
                          onBack={vp.closeVoiceConfiguration}
                          onDraftChange={vp.setDraftVoiceConfig}
                          onResetDefaults={vp.resetDraftVoiceConfigToDefaults}
                          onApply={() => void vp.applyVoiceConfiguration()}
                          onPlayPreview={() => {
                            if (vp.configVoice) vp.speakTypedPreview(vp.configVoice);
                          }}
                          onStopPreview={vp.stopVoicePreview}
                          onUseVoice={() => {
                            if (vp.configVoice) void vp.selectVoice(vp.configVoice);
                          }}
                        />
                      ) : (
                        <CustomVoicesPanel
                          voices={vp.voices}
                          selectedVoiceId={vp.settings?.selected_voice_id ?? null}
                          activeIndex={vp.voiceCarouselIndex}
                          playingVoiceId={vp.playingVoiceId}
                          isPaused={vp.playbackPaused}
                          playbackSource={vp.playbackSource}
                          playbackCurrentTime={vp.playbackCurrentTime}
                          playbackDuration={vp.playbackDuration}
                          orbBands={vp.orbBands}
                          previewText={vp.previewText}
                          previewBusy={vp.previewBusy}
                          onPreviewTextChange={vp.setPreviewText}
                          onSelectIndex={vp.setVoiceCarouselIndex}
                          onToggleSample={vp.toggleSamplePreview}
                          onSpeakTyped={vp.speakTypedPreview}
                          onConfirm={(voice) => void vp.selectVoice(voice)}
                          onOpenConfiguration={vp.openVoiceConfiguration}
                        />
                      )}
                    </>
                  )
                ) : vp.voices.length === 0 ? (
                  <EmptyStateView
                    title={t('voicePilot.voices.emptyTitle')}
                    description={t('voicePilot.voices.emptyBody')}
                    variant="inline"
                  />
                ) : (
                  <>
                    {vp.voiceConfigMode && vp.configVoice ? (
                      <VoiceConfigurationWorkspace
                          voice={vp.configVoice}
                          voiceIndex={
                            vp.configVoiceIndex >= 0
                              ? vp.configVoiceIndex
                              : vp.voiceCarouselIndex
                          }
                          voiceCount={vp.voices.length}
                          draft={vp.draftVoiceConfig}
                          hasUnsaved={vp.hasUnsavedVoiceConfig}
                          applying={vp.applyingVoiceConfig}
                          previewBusy={vp.previewBusy}
                          playing={
                            vp.playingVoiceId === vp.configVoice.voice_id && vp.playbackPlaying
                          }
                          isPaused={
                            vp.playingVoiceId === vp.configVoice.voice_id && vp.playbackPaused
                          }
                          isSelected={vp.settings?.selected_voice_id === vp.configVoice.voice_id}
                          orbBands={vp.orbBands}
                          orbState={
                            vp.playingVoiceId === vp.configVoice.voice_id && vp.playbackPlaying
                              ? 'speaking'
                              : 'listening'
                          }
                          onBack={vp.closeVoiceConfiguration}
                          onDraftChange={vp.setDraftVoiceConfig}
                          onResetDefaults={vp.resetDraftVoiceConfigToDefaults}
                          onApply={() => void vp.applyVoiceConfiguration()}
                          onPlayPreview={() => {
                            if (vp.configVoice) vp.speakTypedPreview(vp.configVoice);
                          }}
                          onStopPreview={vp.stopVoicePreview}
                          onUseVoice={() => {
                            if (vp.configVoice) void vp.selectVoice(vp.configVoice);
                          }}
                        />
                    ) : (
                      <ElevenLabsVoicesPanel
                        voices={vp.voices}
                        selectedVoiceId={vp.settings?.selected_voice_id ?? null}
                        activeIndex={vp.voiceCarouselIndex}
                        playingVoiceId={vp.playingVoiceId}
                        isPaused={vp.playbackPaused}
                        playbackSource={vp.playbackSource}
                        playbackCurrentTime={vp.playbackCurrentTime}
                        playbackDuration={vp.playbackDuration}
                        orbBands={vp.orbBands}
                        previewText={vp.previewText}
                        previewBusy={vp.previewBusy}
                        onPreviewTextChange={vp.setPreviewText}
                        onSelectIndex={vp.setVoiceCarouselIndex}
                        onToggleSample={vp.toggleSamplePreview}
                        onSpeakTyped={vp.speakTypedPreview}
                        onConfirm={(voice) => void vp.selectVoice(voice)}
                        onOpenConfiguration={vp.openVoiceConfiguration}
                      />
                    )}
                  </>
                )}
              </View>
              );
              if (inSettingsShell) return inner;
              return (
                <SearchConfigPanelCard
                  icon={AudioLines}
                  title={t('voicePilot.voices.panelTitle')}
                  subtitle={t('voicePilot.voices.panelSubtitle')}
                  flat={embedded}>
                  {inner}
                </SearchConfigPanelCard>
              );
            })()}
          </View>
        ) : null}

        {!vp.loading && activePrimaryTab === 'settings' ? (
          <View style={{ gap: spacing.lg }}>
            <View
              style={[
                inSettingsShell ? { gap: spacing.md, width: '100%' } : workspaceStyle,
                Platform.OS === 'web' ? ({ overflow: 'visible' } as object) : null,
              ]}>
              <View style={{ gap: spacing.sm, zIndex: 30 }}>
                <SetupFieldTip
                  label={t('voicePilot.settings.provider')}
                  tip={
                    draftIsCustom
                      ? t('voicePilot.provider.customDesc')
                      : t('voicePilot.provider.elevenlabsDesc')
                  }
                  labelWeight="semibold"
                />
                <View style={[styles.primaryTabRow, { gap: spacing.xs }]}>
                  {(
                    [
                      ['elevenlabs', t('voicePilot.provider.elevenlabs'), KeyRound],
                      ['custom', t('voicePilot.provider.custom'), Sparkles],
                    ] as const
                  ).map(([key, label, Icon]) => {
                    const active = providerDraft === key;
                    const chromeIdle = getWebParityTabStyle({
                      active,
                      pressed: false,
                      colors,
                      surfaceRadius,
                      brandRadius: tabRadius,
                      useWebParity: isWebParitySurfaces,
                      colorMode: mode,
                    });
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={t('voicePilot.provider.a11y', { label })}
                        onPress={() => setProviderDraft(key as VoicePilotProvider)}
                        style={({ pressed, hovered }) => {
                          const chrome = getWebParityTabStyle({
                            active,
                            pressed,
                            hovered,
                            colors,
                            surfaceRadius,
                            brandRadius: tabRadius,
                            useWebParity: isWebParitySurfaces,
                            colorMode: mode,
                          });
                          return [
                            styles.primaryTabBtn,
                            getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                            { paddingHorizontal: spacing.sm, gap: spacing.xs },
                          ];
                        }}>
                        <Icon size={14} color={chromeIdle.textColor} />
                        <Text
                          style={[
                            typography.caption,
                            getWebParityTabLabelStyle(chromeIdle.textColor, typography.caption),
                          ]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {vp.error ? (
                <View
                  style={[
                    styles.inlineError,
                    {
                      backgroundColor: colors.dangerBackground ?? 'rgba(185,28,28,0.08)',
                      borderColor: colors.danger,
                      borderRadius: surfaceRadius.button,
                    },
                  ]}>
                  <Text style={[typography.body, { color: colors.danger }]}>{vp.error}</Text>
                </View>
              ) : null}

              {!draftIsCustom ? (
                <View style={{ gap: spacing.xxs, zIndex: 20 }}>
                  <SetupFieldTip
                    label={t('voicePilot.settings.apiKeyLabel')}
                    tip={t('voicePilot.settings.keyHint')}
                  />
                  <AppTextField
                    label=""
                    value={apiKeyFieldValue}
                    onChangeText={(value) => {
                      setApiKeyEditing(true);
                      vp.setApiKeyDraft(isMaskedApiKey(value) ? '' : value);
                    }}
                    onFocus={() => {
                      setApiKeyEditing(true);
                      if (showingSavedMask) {
                        vp.setApiKeyDraft('');
                      }
                    }}
                    onBlur={() => {
                      if (hasSavedApiKey && !vp.apiKeyDraft.trim()) {
                        setApiKeyEditing(false);
                      }
                    }}
                    secureTextEntry={hasDraftKey}
                    placeholder={
                      hasSavedApiKey
                        ? t('chatbot.models.apiKey.savedPlaceholder')
                        : t('voicePilot.settings.keyPlaceholder')
                    }
                    editable={vp.canSettings}
                    {...voicePilotFieldAutofill}
                    {...(Platform.OS === 'web'
                      ? ({ name: 'ragsuite-voice-pilot-api-key' } as object)
                      : null)}
                  />
                  <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
                    {hasSavedApiKey && showingSavedMask
                      ? t('voicePilot.settings.replaceKeyHint')
                      : t('voicePilot.settings.keyHint')}
                  </Text>
                  <ProviderApiKeyConnectionHint
                    isOllama={false}
                    savedKeyState={hasSavedApiKey && !hasDraftKey ? 'saved' : null}
                    resetKey={`${vp.apiKeyDraft}|${vp.settings?.api_key_masked ?? ''}`}
                    onTest={async () =>
                      (await vp.testKey()) ?? { ok: false, message: t('voicePilot.error.testFailed') }
                    }
                  />
                </View>
              ) : null}

              {hasVoicePilot ? (
                <View style={{ gap: spacing.xxs, zIndex: 15 }}>
                  <SetupFieldTip
                    label={t('chatbot.widget.voicePilot.orbName')}
                    tip={t('chatbot.widget.voicePilot.orbName.helper')}
                  />
                  <AppTextField
                    label=""
                    value={orbNameDraft}
                    onChangeText={setOrbNameDraft}
                    editable={vp.canSettings}
                    placeholder={t('chatbot.widget.voicePilot.orbName.placeholder')}
                    maxLength={120}
                  />
                </View>
              ) : null}

              <View style={{ gap: spacing.md, zIndex: 10 }}>
                <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>
                  {t('voicePilot.settings.experience')}
                </Text>
                <View style={{ gap: spacing.xxs }}>
                  <SetupFieldTip
                    label={t('voicePilot.settings.sttLocale')}
                    tip={t('voicePilot.settings.sttLocaleHint')}
                  />
                  <AppSelectField
                    label=""
                    value={vp.localeDraft.trim() || 'en-US'}
                    options={sttLocaleSelectOptions(vp.localeDraft)}
                    onChange={(next) => {
                      if (vp.canSettings) vp.setLocaleDraft(next);
                    }}
                    accessibilityLabel={t('voicePilot.settings.sttLocale')}
                    showSelectedCheckmark
                  />
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing.sm,
                  }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <SetupFieldTip
                      label={t('voicePilot.settings.autoListen')}
                      tip={t('voicePilot.settings.autoListenHint')}
                    />
                  </View>
                  <Switch
                    value={autoListenDraft}
                    onValueChange={setAutoListenDraft}
                    disabled={!vp.canSettings}
                  />
                </View>
              </View>

              <AppButton
                label={
                  setupSaving || vp.saving ? t('common.saving') : t('common.save')
                }
                icon={ActionIcons.save}
                onPress={() => void saveSetup()}
                disabled={!vp.canSettings || setupSaving || vp.saving}
                loading={setupSaving || vp.saving}
              />
            </View>
          </View>
        ) : null}
    </View>
  );

  if (embedded) {
    return (
      <View style={{ width: '100%', gap: inSettingsShell ? spacing.md : spacing.sm }}>
        {hideSegmentTabs ? null : <View style={{ gap: spacing.xs, width: '100%' }}>{header}</View>}
        {body}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        contentMaxWidth={contentMaxWidth}
        horizontalPadding={resolvedHorizontalPadding}
        topPadding={isWeb ? spacing.md + spacing.xs : spacing.sm}
        bottomPaddingExtra={Platform.OS === 'web' ? 0 : 56}
        refreshing={vp.loading}
        onRefresh={() => void vp.reload()}
        stickyHeaderDivider
        header={header}>
        {body}
      </FeatureScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  primaryTabRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2, alignSelf: 'flex-start', maxWidth: '100%' },
  primaryTabRowCompact: { flexWrap: 'nowrap', alignSelf: 'stretch' },
  primaryTabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 0, flexShrink: 0 },
  primaryTabBtnCompact: { flex: 1, minWidth: 0, flexShrink: 1 },
  primaryTabLabelCompact: { flexShrink: 1, fontSize: 12, lineHeight: 16 },
  inlineError: {
    width: '100%',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  orbHit: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 148,
    minHeight: 148,
  },
  orbStage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  orbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionIconBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widgetHint: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
  },
  widgetHintStacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  widgetHintIcon: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  widgetHintCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  widgetHintCta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  widgetHintCtaStacked: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
});
