import React, { useMemo } from 'react';
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
  CircleCheck,
  KeyRound,
  Mic,
  Plug,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Speech,
} from 'lucide-react-native';

import { AudioReactiveOrb } from '@/features/ai-voice-pilot/components/AudioReactiveOrb';
import { CustomVoicesPanel } from '@/features/ai-voice-pilot/components/CustomVoicesPanel';
import { ElevenLabsVoicesPanel } from '@/features/ai-voice-pilot/components/ElevenLabsVoicesPanel';
import { OrbLabPanel } from '@/features/ai-voice-pilot/components/OrbLabPanel';
import { VoiceConfigurationWorkspace } from '@/features/ai-voice-pilot/components/VoiceConfigurationWorkspace';
import { VoicePlaybackBar } from '@/features/ai-voice-pilot/components/VoicePlaybackBar';
import { themeFromPaletteIndex } from '@/features/ai-voice-pilot/components/audio-reactive-orb/orbShaders';
import { useVoicePilot } from '@/features/ai-voice-pilot/hooks/useVoicePilot';
import type {
  VoicePilotPrimaryTab,
  VoicePilotProvider,
  VoicePilotSettingsSection,
} from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { NavGroupLabel } from '@/shared/components/brand';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import {
  getWebParityNavItemStyle,
  getWebParityNavPressableStyle,
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { CONFIG_SIDEBAR_WIDTH } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { genericFieldAutofillProps } from '@/shared/utils/search-input-autofill';
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

export function AiVoicePilotScreen() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, radius, isWebParitySurfaces, mode } = useAppTheme();
  const isCompact = useCompactLayout();
  const { isWeb, contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const resolvedHorizontalPadding = horizontalPadding ?? (isCompact ? spacing.sm : spacing.md);
  const tabRadius = surfaceRadius.button;
  const vp = useVoicePilot();

  const workspaceStyle = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: surfaceRadius.card,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.md,
    }),
    [colors.border, colors.surface, spacing.md, surfaceRadius.card],
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

  const settingsNav: {
    key: VoicePilotSettingsSection;
    label: string;
    icon: React.ComponentType<{ size?: number; color?: string }>;
  }[] = [
    { key: 'provider', label: t('voicePilot.settings.provider'), icon: KeyRound },
    { key: 'experience', label: t('voicePilot.settings.experience'), icon: SlidersHorizontal },
    { key: 'orbLab', label: t('voicePilot.settings.orbLab'), icon: Sparkles },
  ];

  if (!vp.projectId) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, padding: spacing.md }]}>
        <EmptyStateView title={t('voicePilot.noProject.title')} description={t('voicePilot.noProject.body')} />
      </View>
    );
  }

  if (!vp.canUse && !vp.canSettings) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, padding: spacing.md }]}>
        <EmptyStateView title={t('voicePilot.forbidden.title')} description={t('voicePilot.forbidden.body')} />
      </View>
    );
  }

  const header = (
    <>
      {!isCompact ? (
        <PageSectionHeader title={t('voicePilot.title')} subtitle={t('voicePilot.subtitle')} />
      ) : null}
      <View style={[styles.primaryTabRow, { gap: spacing.xs }]}>
        {(
          [
            ['elevenlabs', t('voicePilot.provider.elevenlabs'), KeyRound],
            ['custom', t('voicePilot.provider.custom'), Sparkles],
          ] as const
        ).map(([key, label, Icon]) => {
          const active = vp.voiceProvider === key;
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
              onPress={() => void vp.setVoiceProvider(key as VoicePilotProvider)}
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
                  {
                    paddingHorizontal: spacing.sm,
                    gap: spacing.xs,
                  },
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
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        {vp.isCustomProvider
          ? t('voicePilot.provider.customDesc')
          : t('voicePilot.provider.elevenlabsDesc')}
      </Text>
      <View style={[styles.primaryTabRow, { gap: spacing.xs }]}>
        {tabs.map((tab) => {
          const active = vp.primaryTab === tab.key;
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
              onPress={() => vp.setPrimaryTab(tab.key as VoicePilotPrimaryTab)}
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
                  {
                    paddingHorizontal: spacing.sm,
                    gap: spacing.xs,
                  },
                ];
              }}>
              <Icon size={14} color={chromeIdle.textColor} />
              <Text
                style={[
                  typography.caption,
                  getWebParityTabLabelStyle(chromeIdle.textColor, typography.caption),
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const showSessionControls =
    vp.agentActive ||
    vp.sessionState === 'connecting' ||
    vp.sessionState === 'listening' ||
    vp.sessionState === 'thinking' ||
    vp.sessionState === 'speaking';

  const hasDraftKey = Boolean(vp.apiKeyDraft.trim());
  const showSavedKeyStatus = Boolean(vp.settings?.has_api_key) && !hasDraftKey;

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
        {vp.loading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {!vp.loading && vp.primaryTab === 'pilot' ? (
          <View style={workspaceStyle}>
            <SearchConfigPanelCard
              icon={Mic}
              title={t('voicePilot.pilot.panelTitle')}
              subtitle={t('voicePilot.pilot.panelSubtitle')}>
              <View style={{ gap: spacing.md, alignItems: 'center', paddingVertical: spacing.sm }}>
                {!vp.isCustomProvider && !vp.settings?.has_api_key ? (
                  <EmptyStateView
                    title={t('voicePilot.setup.keyTitle')}
                    description={t('voicePilot.setup.keyBody')}
                    variant="inline"
                    compact
                    actionLabel={t('voicePilot.actions.goToSettings')}
                    onAction={() => {
                      vp.setPrimaryTab('settings');
                      vp.setSettingsSection('provider');
                    }}
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
                    onAction={() => vp.setPrimaryTab('voices')}
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
                      size={148}
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
                ) : null}

                {vp.settings?.selected_voice_name ? (
                  <Text style={[typography.subtitle, { color: colors.text, textAlign: 'center' }]}>
                    {vp.settings.selected_voice_name}
                  </Text>
                ) : null}

                {vp.settings?.selected_voice_id ? (
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.textMuted,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                      },
                    ]}>
                    {stateLabel(vp.sessionState, t, vp.agentActive)}
                  </Text>
                ) : null}

                {vp.interimTranscript ? (
                  <Text style={[typography.body, { color: colors.textSoft, textAlign: 'center' }]}>
                    {vp.interimTranscript}
                  </Text>
                ) : null}

                {showSessionControls ? (
                  <AppButton
                    label={t('voicePilot.actions.stopConversation')}
                    variant="secondary"
                    onPress={vp.endAgentSession}
                  />
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
            </SearchConfigPanelCard>
          </View>
        ) : null}

        {!vp.loading && vp.primaryTab === 'voices' ? (
          <View style={workspaceStyle}>
            <SearchConfigPanelCard
              icon={Speech}
              title={t('voicePilot.voices.panelTitle')}
              subtitle={t('voicePilot.voices.panelSubtitle')}>
              <View style={{ gap: spacing.md }}>
                <Text style={[typography.body, { color: colors.textMuted }]}>
                  {t('voicePilot.voices.helper')}
                </Text>

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
                    onAction={() => {
                      vp.setPrimaryTab('settings');
                      vp.setSettingsSection('provider');
                    }}
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
                          orbBands={vp.orbBands}
                          previewText={vp.previewText}
                          onPreviewTextChange={vp.setPreviewText}
                          onSelectIndex={vp.setVoiceCarouselIndex}
                          onToggleSample={vp.toggleSamplePreview}
                          onSpeakTyped={vp.speakTypedPreview}
                          onConfirm={(voice) => void vp.selectVoice(voice)}
                          onOpenConfiguration={vp.openVoiceConfiguration}
                        />
                      )}
                      {vp.playingVoiceId && vp.playbackVoiceName ? (
                        <VoicePlaybackBar
                          voiceName={vp.playbackVoiceName}
                          playing={vp.playbackPlaying}
                          paused={vp.playbackPaused}
                          currentTime={vp.playbackCurrentTime}
                          duration={vp.playbackDuration}
                          onToggle={vp.togglePlaybackBar}
                        />
                      ) : null}
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
                      <>
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
                        <View style={{ gap: spacing.sm }}>
                          <AppTextField
                            label={t('voicePilot.voices.previewLabel')}
                            value={vp.previewText}
                            onChangeText={vp.setPreviewText}
                            multiline
                            numberOfLines={2}
                            placeholder={t('voicePilot.voices.previewPlaceholder')}
                            {...voicePilotFieldAutofill}
                            {...(Platform.OS === 'web'
                              ? ({ name: 'ragsuite-voice-pilot-config-preview' } as object)
                              : null)}
                          />
                        </View>
                      </>
                    ) : (
                      <ElevenLabsVoicesPanel
                        voices={vp.voices}
                        selectedVoiceId={vp.settings?.selected_voice_id ?? null}
                        activeIndex={vp.voiceCarouselIndex}
                        playingVoiceId={vp.playingVoiceId}
                        isPaused={vp.playbackPaused}
                        playbackSource={vp.playbackSource}
                        orbBands={vp.orbBands}
                        previewText={vp.previewText}
                        onPreviewTextChange={vp.setPreviewText}
                        onSelectIndex={vp.setVoiceCarouselIndex}
                        onToggleSample={vp.toggleSamplePreview}
                        onSpeakTyped={vp.speakTypedPreview}
                        onConfirm={(voice) => void vp.selectVoice(voice)}
                        onOpenConfiguration={vp.openVoiceConfiguration}
                      />
                    )}

                    {vp.playingVoiceId && vp.playbackVoiceName ? (
                      <VoicePlaybackBar
                        voiceName={vp.playbackVoiceName}
                        playing={vp.playbackPlaying}
                        paused={vp.playbackPaused}
                        currentTime={vp.playbackCurrentTime}
                        duration={vp.playbackDuration}
                        onToggle={vp.togglePlaybackBar}
                      />
                    ) : null}
                  </>
                )}
              </View>
            </SearchConfigPanelCard>
          </View>
        ) : null}

        {!vp.loading && vp.primaryTab === 'settings' ? (
          <View style={workspaceStyle}>
            <View
              style={[
                styles.settingsLayout,
                { flexDirection: isCompact ? 'column' : 'row', gap: spacing.lg },
              ]}>
              <View
                style={[
                  styles.settingsNav,
                  {
                    width: isCompact ? '100%' : CONFIG_SIDEBAR_WIDTH,
                    borderColor: colors.border,
                    borderRadius: surfaceRadius.card,
                    backgroundColor: colors.surface,
                    padding: spacing.xs,
                    gap: spacing.sm,
                    alignSelf: 'flex-start',
                  },
                ]}
                accessibilityRole="tablist"
                accessibilityLabel={t('voicePilot.tabs.settings')}>
                <View style={{ gap: spacing.xxs }}>
                  <NavGroupLabel style={{ paddingHorizontal: spacing.xs, paddingTop: spacing.xxs }}>
                    {t('voicePilot.settings.group')}
                  </NavGroupLabel>
                  {settingsNav.map((item) => {
                    const active = vp.settingsSection === item.key;
                    const Icon = item.icon;
                    const textColor = isWebParitySurfaces
                      ? getWebParityNavItemStyle({
                          active,
                          pressed: false,
                          colors,
                          surfaceRadius,
                          brandRadius: radius.sm,
                          useWebParity: true,
                        }).textColor
                      : active
                        ? colors.primary
                        : colors.text;
                    const iconColor = isWebParitySurfaces
                      ? textColor
                      : active
                        ? colors.primary
                        : colors.textMuted;
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={item.label}
                        onPress={() => vp.setSettingsSection(item.key)}
                        style={({ pressed, hovered }) => {
                          const chrome = getWebParityNavItemStyle({
                            active,
                            pressed,
                            hovered,
                            colors,
                            surfaceRadius,
                            brandRadius: radius.sm,
                            useWebParity: isWebParitySurfaces,
                          });
                          return [
                            styles.settingsNavItem,
                            getWebParityNavPressableStyle(chrome),
                            {
                              paddingHorizontal: spacing.sm,
                              gap: spacing.xs,
                            },
                          ];
                        }}>
                        <Icon size={16} color={iconColor} />
                        <Text
                          style={[
                            typography.body,
                            styles.settingsNavLabel,
                            getWebParityTabLabelStyle(textColor, typography.body, { fontSize: 14 }),
                          ]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ flex: 1, minWidth: 0, gap: spacing.md }}>
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
                {vp.settingsSection === 'provider' ? (
                  vp.isCustomProvider ? (
                    <SearchConfigPanelCard
                      icon={KeyRound}
                      title={t('voicePilot.custom.settingsTitle')}
                      subtitle={t('voicePilot.custom.settingsBody')}>
                      <Text style={[typography.body, { color: colors.textMuted }]}>
                        {t('voicePilot.custom.noKeyNeeded')}
                      </Text>
                    </SearchConfigPanelCard>
                  ) : (
                  <SearchConfigPanelCard
                    icon={KeyRound}
                    title={t('voicePilot.settings.elevenlabs')}
                    subtitle={t('voicePilot.settings.providerSubtitle')}>
                    <View style={{ gap: spacing.sm }}>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        {vp.settings?.has_api_key
                          ? t('voicePilot.settings.replaceKeyHint')
                          : t('voicePilot.settings.keyHint')}
                      </Text>
                      {vp.settings?.api_key_masked ? (
                        <Text style={[typography.caption, { color: colors.textSoft }]}>
                          {t('voicePilot.settings.currentKey')}: {vp.settings.api_key_masked}
                        </Text>
                      ) : null}
                      <AppTextField
                        label={t('voicePilot.settings.apiKeyLabel')}
                        value={vp.apiKeyDraft}
                        onChangeText={vp.setApiKeyDraft}
                        secureTextEntry
                        placeholder={t('voicePilot.settings.keyPlaceholder')}
                        editable={vp.canSettings}
                        {...voicePilotFieldAutofill}
                        {...(Platform.OS === 'web'
                          ? ({ name: 'ragsuite-voice-pilot-api-key' } as object)
                          : null)}
                      />
                      {showSavedKeyStatus ? (
                        <View style={[styles.statusRow, { gap: spacing.sm }]}>
                          <View style={[styles.statusRow, { gap: 4 }]}>
                            <CircleCheck size={14} color={colors.success} />
                            <Text style={[typography.caption, { color: colors.success }]}>
                              {t('voicePilot.settings.apiKeySavedStatus')}
                            </Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('voicePilot.settings.testKey')}
                            disabled={!vp.canSettings || vp.testingKey}
                            onPress={() => void vp.testKey()}
                            style={({ pressed, hovered }) => [
                              styles.testBtn,
                              {
                                borderColor: colors.border,
                                borderRadius: surfaceRadius.button,
                                backgroundColor: pressed
                                  ? colors.surfaceMuted
                                  : hovered
                                    ? colors.surfaceHover
                                    : colors.surface,
                                opacity: vp.testingKey ? 0.65 : 1,
                              },
                            ]}>
                            {vp.testingKey ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <>
                                <Plug size={14} color={colors.primary} />
                                <Text
                                  style={[
                                    typography.caption,
                                    { color: colors.primary, fontWeight: '500' },
                                  ]}>
                                  {t('voicePilot.settings.testKey')}
                                </Text>
                              </>
                            )}
                          </Pressable>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                          <AppButton
                            label={vp.saving ? t('common.saving') : t('common.save')}
                            onPress={() =>
                              void vp.saveSettings(
                                { elevenlabs_api_key: vp.apiKeyDraft || undefined },
                                { toastOnSuccess: 'apiKey' },
                              )
                            }
                            disabled={!vp.canSettings || vp.saving || !hasDraftKey}
                          />
                          <AppButton
                            variant="secondary"
                            label={
                              vp.testingKey
                                ? t('voicePilot.settings.testing')
                                : t('voicePilot.settings.testKey')
                            }
                            onPress={() => void vp.testKey()}
                            disabled={!vp.canSettings || vp.testingKey}
                          />
                        </View>
                      )}
                    </View>
                  </SearchConfigPanelCard>
                  )
                ) : vp.settingsSection === 'orbLab' ? (
                  <SearchConfigPanelCard
                    icon={Sparkles}
                    title={t('voicePilot.settings.orbLab')}
                    subtitle={t('voicePilot.settings.orbLabSubtitle')}>
                    <OrbLabPanel />
                  </SearchConfigPanelCard>
                ) : (
                  <SearchConfigPanelCard
                    icon={SlidersHorizontal}
                    title={t('voicePilot.settings.experience')}
                    subtitle={t('voicePilot.settings.experienceSubtitle')}>
                    <View style={{ gap: spacing.md }}>
                      <View style={{ gap: spacing.xs }}>
                        <AppTextField
                          label={t('voicePilot.settings.sttLocale')}
                          value={vp.localeDraft}
                          onChangeText={vp.setLocaleDraft}
                          editable={vp.canSettings}
                          placeholder="en-US"
                          {...voicePilotFieldAutofill}
                          {...(Platform.OS === 'web'
                            ? ({ name: 'ragsuite-voice-pilot-locale' } as object)
                            : null)}
                        />
                        <Text style={[typography.caption, { color: colors.textMuted }]}>
                          {t('voicePilot.settings.sttLocaleHint')}
                        </Text>
                        <AppButton
                          label={t('voicePilot.settings.saveLocale')}
                          onPress={() =>
                            void vp.saveSettings(
                              { stt_locale: vp.localeDraft.trim() || 'en-US' },
                              { toastOnSuccess: 'settings' },
                            )
                          }
                          disabled={!vp.canSettings || vp.saving}
                        />
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: spacing.sm,
                        }}>
                        <View style={{ flex: 1, gap: spacing.xxs }}>
                          <Text style={[typography.body, { color: colors.text }]}>
                            {t('voicePilot.settings.autoListen')}
                          </Text>
                          <Text style={[typography.caption, { color: colors.textMuted }]}>
                            {t('voicePilot.settings.autoListenHint')}
                          </Text>
                        </View>
                        <Switch
                          value={Boolean(vp.settings?.auto_listen_after_reply)}
                          onValueChange={(value) => {
                            void vp.saveSettings(
                              { auto_listen_after_reply: value },
                              { toastOnSuccess: 'settings' },
                            );
                          }}
                          disabled={!vp.canSettings}
                        />
                      </View>
                    </View>
                  </SearchConfigPanelCard>
                )}
              </View>
            </View>
          </View>
        ) : null}
      </FeatureScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  primaryTabRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 },
  primaryTabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
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
  orbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLayout: { alignItems: 'flex-start' },
  settingsNav: { flexShrink: 0, borderWidth: 1 },
  settingsNavItem: { flexDirection: 'row', alignItems: 'center' },
  settingsNavLabel: { flex: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
  },
});
