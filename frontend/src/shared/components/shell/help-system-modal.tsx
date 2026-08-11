import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';

import { useSettings } from '@/features/settings/hooks/useSettings';
import { useTranslation } from '@/i18n';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type GuideId =
  | 'setup-first-crawl-source'
  | 'setup-first-document-source'
  | 'configure-chatbot'
  | 'configure-search';

type GuideStep = { id: string; titleKey: string; descriptionKey: string };

type Guide = {
  id: GuideId;
  titleKey: string;
  descriptionKey: string;
  steps: GuideStep[];
};

const GUIDES: Guide[] = [
  {
    id: 'setup-first-crawl-source',
    titleKey: 'help.guides.setupFirstCrawlSource.title',
    descriptionKey: 'help.guides.setupFirstCrawlSource.description',
    steps: [
      { id: '1', titleKey: 'help.guides.setupFirstCrawlSource.step1.title', descriptionKey: 'help.guides.setupFirstCrawlSource.step1.description' },
      { id: '2', titleKey: 'help.guides.setupFirstCrawlSource.step2.title', descriptionKey: 'help.guides.setupFirstCrawlSource.step2.description' },
      { id: '3', titleKey: 'help.guides.setupFirstCrawlSource.step3.title', descriptionKey: 'help.guides.setupFirstCrawlSource.step3.description' },
      { id: '4', titleKey: 'help.guides.setupFirstCrawlSource.step4.title', descriptionKey: 'help.guides.setupFirstCrawlSource.step4.description' },
    ],
  },
  {
    id: 'setup-first-document-source',
    titleKey: 'help.guides.setupFirstDocumentSource.title',
    descriptionKey: 'help.guides.setupFirstDocumentSource.description',
    steps: [
      { id: '1', titleKey: 'help.guides.setupFirstDocumentSource.step1.title', descriptionKey: 'help.guides.setupFirstDocumentSource.step1.description' },
      { id: '2', titleKey: 'help.guides.setupFirstDocumentSource.step2.title', descriptionKey: 'help.guides.setupFirstDocumentSource.step2.description' },
      { id: '3', titleKey: 'help.guides.setupFirstDocumentSource.step3.title', descriptionKey: 'help.guides.setupFirstDocumentSource.step3.description' },
      { id: '4', titleKey: 'help.guides.setupFirstDocumentSource.step4.title', descriptionKey: 'help.guides.setupFirstDocumentSource.step4.description' },
    ],
  },
  {
    id: 'configure-chatbot',
    titleKey: 'help.guides.configureChatbot.title',
    descriptionKey: 'help.guides.configureChatbot.description',
    steps: [
      { id: '1', titleKey: 'help.guides.configureChatbot.step1.title', descriptionKey: 'help.guides.configureChatbot.step1.description' },
      { id: '2', titleKey: 'help.guides.configureChatbot.step2.title', descriptionKey: 'help.guides.configureChatbot.step2.description' },
      { id: '3', titleKey: 'help.guides.configureChatbot.step3.title', descriptionKey: 'help.guides.configureChatbot.step3.description' },
      { id: '4', titleKey: 'help.guides.configureChatbot.step4.title', descriptionKey: 'help.guides.configureChatbot.step4.description' },
      { id: '5', titleKey: 'help.guides.configureChatbot.step5.title', descriptionKey: 'help.guides.configureChatbot.step5.description' },
    ],
  },
  {
    id: 'configure-search',
    titleKey: 'help.guides.configureSearch.title',
    descriptionKey: 'help.guides.configureSearch.description',
    steps: [
      { id: '1', titleKey: 'help.guides.configureSearch.step1.title', descriptionKey: 'help.guides.configureSearch.step1.description' },
      { id: '2', titleKey: 'help.guides.configureSearch.step2.title', descriptionKey: 'help.guides.configureSearch.step2.description' },
      { id: '3', titleKey: 'help.guides.configureSearch.step3.title', descriptionKey: 'help.guides.configureSearch.step3.description' },
      { id: '4', titleKey: 'help.guides.configureSearch.step4.title', descriptionKey: 'help.guides.configureSearch.step4.description' },
      { id: '5', titleKey: 'help.guides.configureSearch.step5.title', descriptionKey: 'help.guides.configureSearch.step5.description' },
    ],
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function HelpSystemModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const { settings } = useSettings();
  const [expandedGuide, setExpandedGuide] = useState<GuideId | null>(null);

  const docsUrl = settings.help.docsUrl;

  const guides = useMemo(() => GUIDES, []);

  return (
    <AdaptiveOverlay
      visible={visible}
      title={t('help.title')}
      subtitle={t('help.description')}
      titleIcon={ActionIcons.help}
      onClose={onClose}
      maxWidth={640}
      presentation="dialog">
      <View style={{ gap: spacing.md }}>
        <View style={[styles.actions, { gap: spacing.xs }]}>
          <AppButton label={t('help.settings.viewDocs')} size="compact" onPress={() => void Linking.openURL(docsUrl)} />
          <AppButton
            label={t('help.settings.contactSupport')}
            size="compact"
            variant="outline"
            onPress={() => void Linking.openURL(`mailto:${settings.help.supportEmail}`)}
          />
        </View>

        <Text style={[typography.subtitle, { color: colors.text }]}>{t('help.gettingStarted.title')}</Text>

        <AppScrollView style={{ maxHeight: 480 }} keyboardDismissMode="none" keyboardShouldPersistTaps="handled">
          <View style={{ gap: spacing.sm }}>
            {guides.map((guide) => {
              const open = expandedGuide === guide.id;
              return (
                <View
                  key={guide.id}
                  style={[
                    styles.guideCard,
                    {
                      borderColor: colors.border,
                      borderRadius: panelRadius,
                      backgroundColor: colors.surface,
                      padding: spacing.sm,
                    },
                  ]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setExpandedGuide(open ? null : guide.id)}
                    style={styles.guideHeader}>
                    <View style={styles.guideIcon}>
                      <BookOpen size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <Text
                        style={[
                          typography.body,
                          styles.guideTitle,
                          { color: colors.text },
                        ]}>
                        {t(guide.titleKey)}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={open ? undefined : 2}>
                        {t(guide.descriptionKey)}
                      </Text>
                    </View>
                    <View style={styles.guideChevron}>
                      {open ? <ChevronUp size={18} color={colors.textMuted} /> : <ChevronDown size={18} color={colors.textMuted} />}
                    </View>
                  </Pressable>
                  {open ? (
                    <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
                      {guide.steps.map((step, index) => (
                        <View key={step.id} style={{ gap: 2 }}>
                          <Text style={[typography.caption, { color: colors.text }]}>
                            {index + 1}. {t(step.titleKey)}
                          </Text>
                          <Text style={[typography.caption, { color: colors.textMuted }]}>{t(step.descriptionKey)}</Text>
                        </View>
                      ))}
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => void Linking.openURL(docsUrl)}
                        style={[styles.docsLink, { gap: spacing.xxs }]}>
                        <ActionIcons.externalLink size={14} color={colors.primary} />
                        <Text style={[typography.caption, { color: colors.primary }]}>{t('help.guide.button.readDocs')}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </AppScrollView>
      </View>
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  guideCard: {
    borderWidth: 1,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideIcon: {
    width: 20,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  guideTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
  },
  guideChevron: {
    alignSelf: 'center',
    flexShrink: 0,
  },
  docsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
});
