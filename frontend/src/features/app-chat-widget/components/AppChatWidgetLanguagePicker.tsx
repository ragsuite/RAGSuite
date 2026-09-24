import { Check, ChevronDown } from 'lucide-react-native';
import React, { useEffect, useId, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';

import {
  isLightWidgetColor,
  type AppChatWidgetTheme,
} from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import {
  CHATBOT_LANGUAGE_OPTIONS,
  chatbotLanguageFlag,
  chatbotLanguageLabel,
} from '@/features/chatbot-config/utils/chatbot-language-options';
import { createTranslatorForLanguage } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getScrollbarPalette } from '@/shared/utils/themed-scrollbar';

type Props = {
  theme: AppChatWidgetTheme;
  /** Effective visitor/admin language (e.g. de) — not the dashboard UI locale. */
  language?: string | null;
  onLanguageChange?: (language: string) => void;
};

export function AppChatWidgetLanguagePicker({ theme, language, onLanguageChange }: Props) {
  const t = createTranslatorForLanguage(language);
  const { surfaceRadius } = useAppTheme();
  const [open, setOpen] = useState(false);
  const currentLanguage = (language || 'en').trim() || 'en';
  const scrollbarMode = isLightWidgetColor(theme.panelBg) ? 'light' : 'dark';
  const scrollbar = getScrollbarPalette(scrollbarMode);
  const scrollInstanceId = useId().replace(/:/g, '');
  const scrollDomId = `language-picker-scroll-${scrollInstanceId}`;

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.getElementById(scrollDomId);
    if (!el) return;
    el.style.setProperty('--scrollbar-thumb', scrollbar.thumb);
    el.style.setProperty('--scrollbar-thumb-hover', scrollbar.thumbHover);
    el.style.setProperty('--scrollbar-thumb-active', scrollbar.thumbActive);
    el.style.setProperty('--scrollbar-track', 'transparent');
  }, [open, scrollDomId, scrollbar.thumb, scrollbar.thumbHover, scrollbar.thumbActive]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <View style={styles.triggerWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chatbot.widget.app.language')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((next) => !next)}
        style={({ pressed, hovered }) => [
          styles.pill,
          { opacity: pressed || Boolean(hovered) ? 0.92 : 1 },
        ]}>
        <LanguageFlag code={currentLanguage} />
        <Text style={styles.pillLabel} numberOfLines={1}>
          {chatbotLanguageLabel(currentLanguage)}
        </Text>
        <ChevronDown size={14} color={PILL_TEXT} strokeWidth={2} />
      </Pressable>

      {open ? (
        <>
          <Pressable
            accessibilityLabel={t('chatbot.widget.app.menu.dismiss.a11y')}
            onPress={() => setOpen(false)}
            style={[
              styles.menuDismiss,
              Platform.OS === 'web' ? (styles.menuDismissWeb as object) : null,
            ]}
          />
          <View
            style={[
              styles.menuCard,
              {
                backgroundColor: theme.panelBg,
                borderColor: theme.panelBorderColor,
                borderRadius: surfaceRadius.button,
              },
            ]}
            accessibilityRole="menu">
            <ScrollView
              style={[
                styles.menuScroll,
                Platform.OS === 'web'
                  ? ({
                      scrollbarWidth: 'thin',
                      scrollbarColor: `${scrollbar.thumb} transparent`,
                      ['--scrollbar-thumb']: scrollbar.thumb,
                      ['--scrollbar-thumb-hover']: scrollbar.thumbHover,
                      ['--scrollbar-thumb-active']: scrollbar.thumbActive,
                      ['--scrollbar-track']: 'transparent',
                    } as object)
                  : null,
              ]}
              {...(Platform.OS === 'web'
                ? ({
                    dataSet: { ragsuiteScrollbar: 'overlay' },
                    nativeID: scrollDomId,
                  } as ScrollViewProps)
                : null)}
              showsVerticalScrollIndicator
              {...(Platform.OS === 'ios'
                ? { indicatorStyle: scrollbarMode === 'dark' ? ('white' as const) : ('black' as const) }
                : null)}
              keyboardShouldPersistTaps="handled">
              {CHATBOT_LANGUAGE_OPTIONS.map((option) => {
                const selected = option.key === currentLanguage;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    onPress={() => {
                      setOpen(false);
                      if (option.key !== currentLanguage) {
                        onLanguageChange?.(option.key);
                      }
                    }}
                    style={({ pressed, hovered }) => [
                      styles.menuRow,
                      {
                        backgroundColor:
                          pressed || Boolean(hovered) || selected
                            ? theme.inputSectionBg
                            : 'transparent',
                        borderRadius: Math.max(6, surfaceRadius.button - 4),
                      },
                    ]}>
                    <LanguageFlag code={option.key} />
                    <Text
                      style={[
                        styles.menuRowLabel,
                        {
                          color: theme.heroTitleColor,
                          fontWeight: selected ? '600' : '400',
                        },
                      ]}
                      numberOfLines={1}>
                      {option.label}
                    </Text>
                    {selected ? (
                      <Check size={16} color={theme.accentColor} strokeWidth={2.25} />
                    ) : (
                      <View style={styles.checkSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      ) : null}
    </View>
  );
}

function LanguageFlag({ code }: { code: string }) {
  return (
    <View style={styles.flagClip}>
      <Text style={styles.flagEmoji}>{chatbotLanguageFlag(code)}</Text>
    </View>
  );
}

const PILL_TEXT = '#0F172A';

const styles = StyleSheet.create({
  triggerWrap: {
    position: 'relative',
    zIndex: 6,
    flexShrink: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.14)',
    backgroundColor: '#FFFFFF',
  },
  pillLabel: {
    color: PILL_TEXT,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 108,
  },
  flagClip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagEmoji: {
    fontSize: 26,
    lineHeight: 26,
    width: 26,
    height: 26,
    textAlign: 'center',
  },
  menuDismiss: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  menuDismissWeb: {
    position: 'fixed' as unknown as 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  menuCard: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    minWidth: 200,
    maxWidth: 260,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    zIndex: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
      },
      default: {
        elevation: 6,
      },
    }),
  },
  menuScroll: {
    maxHeight: 280,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  checkSpacer: {
    width: 16,
    height: 16,
  },
});
