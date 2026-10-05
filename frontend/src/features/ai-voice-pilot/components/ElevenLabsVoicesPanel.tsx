import { Pause, Search, Volume2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CustomVoiceListRow } from '@/features/ai-voice-pilot/components/CustomVoiceListRow';
import { SetupFieldTip } from '@/features/ai-voice-pilot/components/SetupFieldTip';
import { VoiceSpherePicker } from '@/features/ai-voice-pilot/components/VoiceSpherePicker';
import {
  useVoicePilotContentWidth,
  voicePanelIsNarrow,
} from '@/features/ai-voice-pilot/hooks/useVoicePilotContentWidth';
import type { VoiceAudioBands } from '@/features/ai-voice-pilot/utils/voice-audio-session';
import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { filterCustomVoices } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { ListPaginationFooter } from '@/shared/components/list-pagination-footer';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useOffsetPagination } from '@/shared/hooks/use-offset-pagination';
import { focusFieldShellStyle, webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import {
  genericFieldAutofillProps,
  searchInputAutofillProps,
} from '@/shared/utils/search-input-autofill';

const FILTER_INLINE_MIN_WIDTH = 140;
const LANGUAGE_MENU_WIDTH = 360;
const voicePilotFieldAutofill = {
  ...genericFieldAutofillProps,
  autoComplete: 'new-password' as const,
};

type Props = {
  voices: VoicePilotVoice[];
  selectedVoiceId: string | null;
  activeIndex: number;
  playingVoiceId: string | null;
  isPaused: boolean;
  playbackSource: 'sample' | 'typed' | null;
  playbackCurrentTime?: number;
  playbackDuration?: number;
  orbBands?: VoiceAudioBands;
  previewText: string;
  previewBusy?: boolean;
  onPreviewTextChange: (value: string) => void;
  onSelectIndex: (index: number) => void;
  /** Orb / list play — predefined ElevenLabs sample URL. */
  onToggleSample: (voice: VoicePilotVoice) => void;
  /** Speak preview button only — typed preview text TTS. */
  onSpeakTyped: (voice: VoicePilotVoice) => void;
  onConfirm: (voice: VoicePilotVoice) => void;
  onOpenConfiguration?: (voice: VoicePilotVoice) => void;
};

export function ElevenLabsVoicesPanel({
  voices,
  selectedVoiceId,
  activeIndex,
  playingVoiceId,
  isPaused,
  playbackSource,
  playbackCurrentTime = 0,
  playbackDuration = 0,
  orbBands,
  previewText,
  previewBusy = false,
  onPreviewTextChange,
  onSelectIndex,
  onToggleSample,
  onSpeakTyped,
  onConfirm,
  onOpenConfiguration,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const viewportCompact = useCompactLayout();
  const { width: contentWidth, onLayout } = useVoicePilotContentWidth();
  const isCompact = viewportCompact || voicePanelIsNarrow(contentWidth);
  const languageMenuWidth = Math.min(LANGUAGE_MENU_WIDTH, Math.max(220, contentWidth || LANGUAGE_MENU_WIDTH));
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('all');
  const [gender, setGender] = useState('all');
  const [searchFocused, setSearchFocused] = useState(false);
  const controlHeight = TOUCH_TARGET_MIN;
  const controlRadius = surfaceRadius.input;

  const languages = useMemo(() => {
    const set = new Set<string>();
    voices.forEach((v) => {
      const lang = v.language || v.labels?.language || v.labels?.accent;
      if (lang) set.add(lang);
    });
    return Array.from(set).sort();
  }, [voices]);

  const languageOptions = useMemo(
    () => [
      { key: 'all', label: t('voicePilot.voices.list.allLanguages') },
      ...languages.map((lang) => ({ key: lang, label: lang })),
    ],
    [languages, t],
  );

  const genderOptions = useMemo(
    () => [
      { key: 'all', label: t('voicePilot.voices.list.allGenders') },
      { key: 'male', label: t('voicePilot.voices.list.male') },
      { key: 'female', label: t('voicePilot.voices.list.female') },
      { key: 'neutral', label: t('voicePilot.voices.list.neutral') },
    ],
    [t],
  );

  const filtered = useMemo(
    () =>
      filterCustomVoices(voices, {
        search,
        language: language === 'all' ? '' : language,
        gender: gender === 'all' ? '' : gender,
      }),
    [voices, search, language, gender],
  );

  const filterResetKey = `${search}|${language}|${gender}`;
  const { page, pageSize, offset, totalPages, setPage, setPageSize } = useOffsetPagination({
    defaultPageSize: 20,
    total: filtered.length,
    filterResetKey,
  });

  const pageItems = useMemo(
    () => filtered.slice(offset, offset + pageSize),
    [filtered, offset, pageSize],
  );

  useEffect(() => {
    if (filtered.length === 0) return;
    if (activeIndex >= filtered.length) {
      onSelectIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, activeIndex, onSelectIndex]);

  useEffect(() => {
    if (filtered.length === 0) return;
    const safe = Math.min(Math.max(activeIndex, 0), filtered.length - 1);
    setPage(Math.floor(safe / pageSize) + 1);
  }, [activeIndex, filtered.length, pageSize, setPage]);

  const activeVoice =
    filtered[Math.min(activeIndex, Math.max(filtered.length - 1, 0))] ?? null;
  const activeVoiceId = activeVoice?.voice_id;
  const typedActive =
    Boolean(activeVoice) &&
    playingVoiceId === activeVoice!.voice_id &&
    playbackSource === 'typed';
  const typedPlaying = typedActive && !isPaused;

  return (
    <View style={{ gap: spacing.md, width: '100%' }} onLayout={onLayout}>
      <View
        style={[
          styles.toolbar,
          isCompact ? styles.toolbarStacked : styles.toolbarRow,
          { gap: spacing.sm },
        ]}>
        <View
          style={[
            styles.searchWrap,
            isCompact ? styles.searchStacked : styles.searchInline,
            {
              height: controlHeight,
              minHeight: controlHeight,
              borderRadius: controlRadius,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.sm,
              ...focusFieldShellStyle(searchFocused, colors.primary, colors.border),
            },
          ]}>
          <Search size={16} color={searchFocused ? colors.primary : colors.textMuted} />
          <TextInput
            {...searchInputAutofillProps}
            accessibilityLabel={t('voicePilot.voices.list.searchLabel')}
            placeholder={t('voicePilot.voices.list.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[
              getToolbarSearchInputStyle(typography.body, controlHeight),
              styles.searchInput,
              { color: colors.text },
              Platform.OS === 'web' ? styles.searchInputWeb : null,
              webSuppressInputOutline(),
            ]}
          />
        </View>

        <View
          style={[
            styles.filters,
            isCompact ? styles.filtersStacked : styles.filtersRow,
            { gap: spacing.sm },
          ]}>
          <View style={isCompact ? styles.filterFull : styles.filterSlot}>
            <AppSelectField
              label=""
              variant="inline"
              value={language}
              options={languageOptions}
              onChange={setLanguage}
              accessibilityLabel={t('voicePilot.voices.list.language')}
              pickerTitle={t('voicePilot.voices.list.language')}
              controlHeight={controlHeight}
              inlineMinWidth={isCompact ? undefined : FILTER_INLINE_MIN_WIDTH}
              menuWidth={languageMenuWidth}
              menuLockWidth
            />
          </View>
          <View style={isCompact ? styles.filterFull : styles.filterSlot}>
            <AppSelectField
              label=""
              variant="inline"
              value={gender}
              options={genderOptions}
              onChange={setGender}
              accessibilityLabel={t('voicePilot.voices.list.gender')}
              pickerTitle={t('voicePilot.voices.list.gender')}
              controlHeight={controlHeight}
              inlineMinWidth={isCompact ? undefined : FILTER_INLINE_MIN_WIDTH}
            />
          </View>
        </View>
      </View>

      {filtered.length === 0 ? (
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('voicePilot.voices.list.emptyFilter')}
        </Text>
      ) : (
        <>
          <VoiceSpherePicker
            voices={filtered}
            selectedVoiceId={selectedVoiceId}
            activeIndex={activeIndex}
            playingVoiceId={playingVoiceId}
            isPaused={isPaused}
            playbackSource={playbackSource}
            orbBands={orbBands}
            title={t('voicePilot.voices.trendingTitle')}
            subtitle={t('voicePilot.voices.trendingSubtitle')}
            onSelectIndex={onSelectIndex}
            onToggleSample={onToggleSample}
            onConfirm={onConfirm}
            onOpenConfiguration={onOpenConfiguration}
          />

          <View style={{ gap: spacing.sm, overflow: 'visible', zIndex: 5 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
              }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SetupFieldTip
                  label={t('voicePilot.voices.typeToTest')}
                  tip={t('voicePilot.voices.previewFieldTip')}
                  labelWeight="semibold"
                />
              </View>
              {activeVoice ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    typedPlaying
                      ? t('voicePilot.voices.pause.a11y', { name: activeVoice.name })
                      : typedActive && isPaused
                        ? t('voicePilot.voices.resume')
                        : t('voicePilot.voices.speakTyped.a11y', { name: activeVoice.name })
                  }
                  disabled={previewBusy && !typedPlaying}
                  onPress={() => onSpeakTyped(activeVoice)}
                  style={({ pressed, hovered }) => [
                    styles.speakTypedBtn,
                    {
                      borderColor: colors.primary,
                      backgroundColor:
                        pressed || hovered ? colors.primaryPressed ?? colors.primary : colors.primary,
                      borderRadius: surfaceRadius.button,
                      opacity: previewBusy && !typedPlaying ? 0.7 : 1,
                    },
                  ]}>
                  {previewBusy && !typedPlaying ? (
                    <ActivityIndicator color={colors.textOnPrimary} />
                  ) : typedPlaying ? (
                    <Pause size={18} color={colors.textOnPrimary} fill={colors.textOnPrimary} />
                  ) : (
                    <Volume2 size={18} color={colors.textOnPrimary} />
                  )}
                </Pressable>
              ) : null}
            </View>
            <AppTextField
              label=""
              value={previewText}
              onChangeText={onPreviewTextChange}
              multiline
              numberOfLines={3}
              placeholder={t('voicePilot.voices.previewPlaceholder')}
              {...voicePilotFieldAutofill}
              {...(Platform.OS === 'web'
                ? ({ name: 'ragsuite-voice-pilot-elevenlabs-preview' } as object)
                : null)}
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t('voicePilot.voices.list.resultsCount', { count: String(filtered.length) })}
            </Text>

            <View style={{ gap: spacing.xs }}>
              {pageItems.map((voice, pageIdx) => {
                const indexInFiltered = offset + pageIdx;
                const isActive = voice.voice_id === activeVoiceId;
                const isPilotSelected = voice.voice_id === selectedVoiceId;
                const isThisVoice =
                  playingVoiceId === voice.voice_id && playbackSource === 'sample';
                const isPlaying = isThisVoice && !isPaused;
                const playbackProgress =
                  isThisVoice && playbackDuration > 0
                    ? Math.min(1, playbackCurrentTime / playbackDuration)
                    : 0;
                return (
                  <CustomVoiceListRow
                    key={voice.voice_id}
                    voice={voice}
                    isActive={isActive}
                    isPilotSelected={isPilotSelected}
                    isPlaying={isPlaying}
                    playbackProgress={playbackProgress}
                    compact={isCompact}
                    onSelect={() => onSelectIndex(indexInFiltered)}
                    onSpeak={() => {
                      onSelectIndex(indexInFiltered);
                      onToggleSample(voice);
                    }}
                    onConfirm={() => {
                      onSelectIndex(indexInFiltered);
                      onConfirm(voice);
                    }}
                  />
                );
              })}

              <ListPaginationFooter
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel={t('voicePilot.tabs.voices').toLowerCase()}
                compact={isCompact}
                visiblePageCount={3}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    width: '100%',
  },
  speakTypedBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
  },
  searchInline: {
    flex: 1,
    minWidth: 0,
  },
  searchStacked: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
  },
  searchInputWeb: {
    outlineStyle: 'none',
  } as object,
  filters: {
    flexShrink: 0,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filtersStacked: {
    flexDirection: 'column',
    width: '100%',
  },
  filterSlot: {
    minWidth: FILTER_INLINE_MIN_WIDTH,
  },
  filterFull: {
    width: '100%',
  },
});
