import { Image } from 'expo-image';
import { ImageIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SearchTestCitation } from '@/features/search-config/types/search-config.types';
import { faviconUrlForCitation } from '@/features/search-config/utils/source-preview-images';
import { parseCitationUrl } from '@/shared/utils/citation-url';
import { openCitationUrl } from '@/shared/utils/open-citation-url';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const IS_WEB = Platform.OS === 'web';
const THUMB_SIZE = 48;

type Props = {
  source: SearchTestCitation;
};

export function GoogleSourceCard({ source }: Props) {
  const { colors } = useAppTheme();
  const [ogFailed, setOgFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const ogUri = source.image?.trim() || '';
  const faviconUri = faviconUrlForCitation(source.url);
  const thumbUri = !ogFailed && ogUri ? ogUri : !faviconFailed && faviconUri ? faviconUri : '';

  React.useEffect(() => {
    setOgFailed(false);
    setFaviconFailed(false);
  }, [source.id, source.image, source.url]);
  const { domain } = parseCitationUrl(source.url);
  let domainDisplay = domain;
  if (!domainDisplay) {
    try {
      domainDisplay = new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
      domainDisplay = source.url;
    }
  }

  const onPress = () => {
    if (source.url && source.url !== '#') {
      void openCitationUrl(source.url).catch(() => {});
    }
  };

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open source: ${source.title}`}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.card,
        {
          borderColor: hovered ? colors.border : 'transparent',
          backgroundColor: hovered ? colors.surfaceHover : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
        IS_WEB
          ? ({ cursor: 'pointer', transitionProperty: 'background-color, border-color', transitionDuration: '120ms' } as object)
          : null,
      ]}>
      <View style={[styles.textCol, { gap: 3 }]}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {source.title}
        </Text>
        <Text style={[styles.domain, { color: colors.textMuted }]} numberOfLines={1}>
          {domainDisplay}
        </Text>
        {source.excerpt ? (
          <Text style={[styles.excerpt, { color: colors.textMuted }]} numberOfLines={2}>
            {source.excerpt}
          </Text>
        ) : null}
      </View>
      <View style={[styles.thumbWrap, { backgroundColor: colors.surfaceMuted, borderRadius: 8 }]}>
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

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: 10,
    width: '100%',
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
  domain: {
    fontSize: 11,
    lineHeight: 14,
  },
  excerpt: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    overflow: 'hidden',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  placeholderBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
