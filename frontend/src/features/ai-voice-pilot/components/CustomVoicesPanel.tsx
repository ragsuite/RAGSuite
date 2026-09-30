import { Search } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { CustomVoiceListRow } from '@/features/ai-voice-pilot/components/CustomVoiceListRow';
import { VoiceSpherePicker } from '@/features/ai-voice-pilot/components/VoiceSpherePicker';
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
/** Wide enough for labels like "Chinese (Zhongyuan Mandarin Shaanxi, Simplified)". */
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
  orbBands?: VoiceAudioBands;
  previewText: string;
  onPreviewTextChange: (value: string) => void;
  onSelectIndex: (index: number) => void;
  /** Orb / list play — predefined Custom sample (fixed phrase). */
  onToggleSample: (voice: VoicePilotVoice) => void;
  /** Speak preview — editable preview text TTS. */
  onSpeakTyped: (voice: VoicePilotVoice) => void;
  onConfirm: (voice: VoicePilotVoice) => void;
  onOpenConfiguration?: (voice: VoicePilotVoice) => void;
};

export function CustomVoicesPanel({
  voices,
  selectedVoiceId,
  activeIndex,
  playingVoiceId,
  isPaused,
  playbackSource,
  orbBands,
  previewText,
  onPreviewTextChange,
  onSelectIndex,
  onToggleSample,
  onSpeakTyped,
  onConfirm,
  onOpenConfiguration,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const isCompact = useCompactLayout();
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('all');
  const [gender, setGender] = useState('all');
  const [searchFocused, setSearchFocused] = useState(false);
  const controlHeight = TOUCH_TARGET_MIN;
  const controlRadius = surfaceRadius.input;

  const languages = useMemo(() => {
    const set = new Set<string>();
    voices.forEach((v) => {
      const lang = v.language || v.labels?.language;
      if (lang) set.add(lang);
    });
    return Array.from(set).sort();
  }, [voices]);

  const languageOptions = useMemo(
    () => [
      { key: 'all', label: t('voicePilot.custom.allLanguages') },
      ...languages.map((lang) => ({ key: lang, label: lang })),
    ],
    [languages, t],
  );

  const genderOptions = useMemo(
    () => [
      { key: 'all', label: t('voicePilot.custom.allGenders') },
      { key: 'male', label: t('voicePilot.custom.male') },
      { key: 'female', label: t('voicePilot.custom.female') },
      { key: 'neutral', label: t('voicePilot.custom.neutral') },
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

  const activeVoiceId = filtered[Math.min(activeIndex, Math.max(filtered.length - 1, 0))]?.voice_id;

  return (
    <View style={{ gap: spacing.md }}>
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
            accessibilityLabel={t('voicePilot.custom.searchLabel')}
            placeholder={t('voicePilot.custom.searchPlaceholder')}
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
              accessibilityLabel={t('voicePilot.custom.language')}
              pickerTitle={t('voicePilot.custom.language')}
              controlHeight={controlHeight}
              inlineMinWidth={isCompact ? undefined : FILTER_INLINE_MIN_WIDTH}
              menuWidth={LANGUAGE_MENU_WIDTH}
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
              accessibilityLabel={t('voicePilot.custom.gender')}
              pickerTitle={t('voicePilot.custom.gender')}
              controlHeight={controlHeight}
              inlineMinWidth={isCompact ? undefined : FILTER_INLINE_MIN_WIDTH}
            />
          </View>
        </View>
      </View>

      {filtered.length === 0 ? (
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('voicePilot.custom.emptyFilter')}
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
            title={t('voicePilot.custom.carouselTitle')}
            subtitle={t('voicePilot.custom.carouselSubtitle')}
            onSelectIndex={onSelectIndex}
            onToggleSample={onToggleSample}
            onSpeakTyped={onSpeakTyped}
            onConfirm={onConfirm}
            onOpenConfiguration={onOpenConfiguration}
          />

          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.subtitle, { color: colors.text }]}>
              {t('voicePilot.voices.typeToTest')}
            </Text>
            <AppTextField
              label={t('voicePilot.voices.previewLabel')}
              value={previewText}
              onChangeText={onPreviewTextChange}
              multiline
              numberOfLines={3}
              placeholder={t('voicePilot.voices.previewPlaceholder')}
              {...voicePilotFieldAutofill}
              {...(Platform.OS === 'web'
                ? ({ name: 'ragsuite-voice-pilot-custom-preview' } as object)
                : null)}
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t('voicePilot.custom.resultsCount', { count: String(filtered.length) })}
            </Text>

            <View style={{ gap: spacing.xs }}>
              {pageItems.map((voice, pageIdx) => {
                const indexInFiltered = offset + pageIdx;
                const isActive = voice.voice_id === activeVoiceId;
                const isPilotSelected = voice.voice_id === selectedVoiceId;
                const isThisVoice =
                  playingVoiceId === voice.voice_id && playbackSource === 'sample';
                const isPlaying = isThisVoice && !isPaused;
                return (
                  <CustomVoiceListRow
                    key={voice.voice_id}
                    voice={voice}
                    isActive={isActive}
                    isPilotSelected={isPilotSelected}
                    isPlaying={isPlaying}
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
