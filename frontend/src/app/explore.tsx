import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BOTTOM_TAB_INSET, CONTENT_MAX_WIDTH } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useTranslation } from '@/i18n';

export default function TabTwoScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { t } = useTranslation();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BOTTOM_TAB_INSET + 16,
  };
  const { colors } = useAppTheme();

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: 64,
      paddingBottom: 24,
    },
  });

  return (
    <AppScrollView
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">{t('help.explore.title')}</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            {t('help.explore.intro')}
          </ThemedText>

          <ExternalLink href="https://docs.expo.dev" asChild>
            <Pressable style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="surfaceMuted" style={styles.linkButton}>
                <ThemedText type="link">{t('help.explore.expoDocs')}</ThemedText>
                <SymbolView
                  tintColor={colors.text}
                  name={{ ios: 'arrow.up.right.square', android: 'link', web: 'link' }}
                  size={12}
                />
              </ThemedView>
            </Pressable>
          </ExternalLink>
        </ThemedView>

        <ThemedView style={styles.sectionsWrapper}>
          <Collapsible title={t('help.explore.sections.fileRouting.title')}>
            <ThemedText type="small">
              {t('help.explore.sections.fileRouting.body1Prefix')}
              <ThemedText type="code">src/app/index.tsx</ThemedText>
              {t('help.explore.sections.fileRouting.body1Middle')}
              <ThemedText type="code">src/app/explore.tsx</ThemedText>
            </ThemedText>
            <ThemedText type="small">
              {t('help.explore.sections.fileRouting.body2Prefix')}
              <ThemedText type="code">src/app/_layout.tsx</ThemedText>
              {t('help.explore.sections.fileRouting.body2Suffix')}
            </ThemedText>
            <ExternalLink href="https://docs.expo.dev/router/introduction">
              <ThemedText type="linkPrimary">{t('help.explore.learnMore')}</ThemedText>
            </ExternalLink>
          </Collapsible>

          <Collapsible title={t('help.explore.sections.platformSupport.title')}>
            <ThemedView type="surfaceMuted" style={styles.collapsibleContent}>
              <ThemedText type="small">
                {t('help.explore.sections.platformSupport.bodyPrefix')}
                <ThemedText type="smallBold">w</ThemedText>
                {t('help.explore.sections.platformSupport.bodySuffix')}
              </ThemedText>
              <Image
                source={require('@/assets/images/tutorial-web.png')}
                style={styles.imageTutorial}
              />
            </ThemedView>
          </Collapsible>

          <Collapsible title={t('help.explore.sections.images.title')}>
            <ThemedText type="small">
              {t('help.explore.sections.images.bodyPrefix')}
              <ThemedText type="code">@2x</ThemedText>
              {t('help.explore.sections.images.bodyMiddle')}
              <ThemedText type="code">@3x</ThemedText>
              {t('help.explore.sections.images.bodySuffix')}
            </ThemedText>
            <Image source={require('@/assets/images/react-logo.png')} style={styles.imageReact} />
            <ExternalLink href="https://reactnative.dev/docs/images">
              <ThemedText type="linkPrimary">{t('help.explore.learnMore')}</ThemedText>
            </ExternalLink>
          </Collapsible>

          <Collapsible title={t('help.explore.sections.themes.title')}>
            <ThemedText type="small">
              {t('help.explore.sections.themes.bodyPrefix')}
              <ThemedText type="code">useColorScheme()</ThemedText>
              {t('help.explore.sections.themes.bodySuffix')}
            </ThemedText>
            <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
              <ThemedText type="linkPrimary">{t('help.explore.learnMore')}</ThemedText>
            </ExternalLink>
          </Collapsible>

          <Collapsible title={t('help.explore.sections.animations.title')}>
            <ThemedText type="small">
              {t('help.explore.sections.animations.bodyPrefix')}
              <ThemedText type="code">src/components/ui/collapsible.tsx</ThemedText>
              {t('help.explore.sections.animations.bodyMiddle')}
              <ThemedText type="code">react-native-reanimated</ThemedText>
              {t('help.explore.sections.animations.bodySuffix')}
            </ThemedText>
          </Collapsible>
        </ThemedView>
        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </AppScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: CONTENT_MAX_WIDTH,
    flexGrow: 1,
  },
  titleContainer: {
    gap: 16,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 64,
  },
  centerText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  linkButton: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 32,
    justifyContent: 'center',
    gap: 4,
    alignItems: 'center',
  },
  sectionsWrapper: {
    gap: 32,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  collapsibleContent: {
    alignItems: 'center',
  },
  imageTutorial: {
    width: '100%',
    aspectRatio: 296 / 171,
    borderRadius: 16,
    marginTop: 8,
  },
  imageReact: {
    width: 100,
    height: 100,
    alignSelf: 'center',
  },
});
