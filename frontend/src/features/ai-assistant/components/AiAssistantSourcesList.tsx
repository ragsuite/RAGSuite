import { Image } from 'expo-image';
import { ChevronDown, ChevronUp, ImageIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AiAssistantCitation } from '@/features/ai-assistant/types/ai-assistant.types';
import { useTranslation } from '@/i18n';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { parseCitationUrl } from '@/shared/utils/citation-url';
import { openCitationUrl } from '@/shared/utils/open-citation-url';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const IS_WEB = Platform.OS === 'web';
const THUMB_SIZE = 48;
const BADGE_SIZE = 18;
/** Default visible rows before inner scroll. */
const VISIBLE_ROW_COUNT = 4;
const ROW_HEIGHT = 72;
const LIST_MAX_HEIGHT = VISIBLE_ROW_COUNT * ROW_HEIGHT;

function faviconForUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed === '#') return '';
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '');
    if (!host) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return '';
  }
}

function previewUriForCitation(source: AiAssistantCitation): string {
  const og = (source.image || '').trim();
  if (og) return og;
  return faviconForUrl(source.url || '');
}

/** Hostname + path for display (e.g. nitsantech.de/blog/...). */
function pathAwareUrlLabel(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed === '#') return '';
  const { domain, path } = parseCitationUrl(trimmed);
  if (!domain) return trimmed;
  if (!path || path === '/') return domain;
  const cleaned = path.startsWith('/') ? path.slice(1) : path;
  return cleaned ? `${domain}/${cleaned}` : domain;
}

function pickUniquePreviewUris(citations: AiAssistantCitation[], max = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (uri: string) => {
    const key = uri.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  for (const c of citations) {
    if (out.length >= max) break;
    push((c.image || '').trim());
  }
  for (const c of citations) {
    if (out.length >= max) break;
    push(faviconForUrl(c.url || ''));
  }
  return out;
}

function BadgeAvatar({ uri, mutedColor }: { uri: string; mutedColor: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.badgeDot, { backgroundColor: mutedColor }]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.badgeDotImg}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

function SourceRow({ source }: { source: AiAssistantCitation }) {
  const { colors } = useAppTheme();
  const [ogFailed, setOgFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const url = (source.url || '').trim();
  const ogUri = (source.image || '').trim();
  const faviconUri = faviconForUrl(url);
  const thumbUri =
    !ogFailed && ogUri ? ogUri : !faviconFailed && faviconUri ? faviconUri : '';
  const urlLabel = pathAwareUrlLabel(url);

  const onPress = () => {
    if (url && url !== '#') {
      void openCitationUrl(url).catch(() => {});
    }
  };

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open source: ${source.title}`}
      onPress={onPress}
      disabled={!url || url === '#'}
      style={({ pressed, hovered }) => [
        styles.card,
        {
          borderColor: hovered ? colors.border : 'transparent',
          backgroundColor: hovered ? colors.surfaceHover : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
        IS_WEB
          ? ({
              cursor: url ? 'pointer' : 'default',
              transitionProperty: 'background-color, border-color',
              transitionDuration: '120ms',
            } as object)
          : null,
      ]}
    >
      <View style={[styles.textCol, { gap: 3 }]}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {source.title}
        </Text>
        {urlLabel ? (
          <Text style={[styles.urlLabel, { color: colors.textMuted }]} numberOfLines={1}>
            {urlLabel}
          </Text>
        ) : null}
      </View>
      <View style={[styles.thumbWrap, { backgroundColor: colors.surfaceMuted }]}>
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={styles.thumbImg}
            contentFit="cover"
            onError={() => {
              if (!ogFailed && ogUri && thumbUri === ogUri) {
                setOgFailed(true);
                return;
              }
              setFaviconFailed(true);
            }}
          />
        ) : (
          <View style={styles.placeholderBox}>
            <ImageIcon size={16} color={colors.textMuted} strokeWidth={1.2} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

type Props = {
  citations: AiAssistantCitation[];
};

/** Full-width Sources list for AI Assistant (round OGs, path URLs, chevron toggle). */
export function AiAssistantSourcesList({ citations }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const [expanded, setExpanded] = useState(true);

  const badgeImages = useMemo(() => pickUniquePreviewUris(citations, 3), [citations]);

  if (!citations.length) return null;

  const header =
    citations.length === 1
      ? t('aiAssistant.citations.sitesOne', { count: 1 })
      : t('aiAssistant.citations.sitesPlural', { count: citations.length });

  return (
    <View style={{ width: '100%', gap: spacing.xs, paddingTop: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded
            ? t('aiAssistant.citations.collapseA11y')
            : t('aiAssistant.citations.expandA11y')
        }
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed, hovered }) => [
          styles.headerRow,
          {
            opacity: pressed ? 0.85 : 1,
            backgroundColor: hovered ? colors.surfaceHover : 'transparent',
          },
          IS_WEB ? ({ cursor: 'pointer' } as object) : null,
        ]}
      >
        <View style={styles.badgeRow}>
          {badgeImages.map((uri, i) => (
            <View key={`${uri}_${i}`} style={i > 0 ? { marginLeft: -6 } : null}>
              <BadgeAvatar uri={uri} mutedColor={colors.surfaceMuted} />
            </View>
          ))}
          <Text style={[typography.caption, { color: colors.textMuted, marginLeft: 6 }]}>
            {header}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color={colors.textMuted} />
        ) : (
          <ChevronDown size={16} color={colors.textMuted} />
        )}
      </Pressable>

      {expanded ? (
        <AppScrollView
          nestedScrollEnabled
          style={{ maxHeight: LIST_MAX_HEIGHT, width: '100%' }}
          contentContainerStyle={{ gap: 2, width: '100%' }}
          showsVerticalScrollIndicator={citations.length > VISIBLE_ROW_COUNT}
        >
          {citations.map((cite, idx) => (
            <SourceRow key={`${cite.url || cite.title}-${idx}`} source={cite} />
          ))}
        </AppScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 8,
    width: '100%',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  badgeDot: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    overflow: 'hidden',
  },
  badgeDotImg: {
    width: '100%',
    height: '100%',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: 10,
    width: '100%',
    minHeight: ROW_HEIGHT - 8,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
  },
  urlLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    overflow: 'hidden',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    borderRadius: THUMB_SIZE / 2,
  },
  placeholderBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
