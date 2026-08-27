import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import type { TrustDocument } from '@/features/trust-center/content/types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: TrustDocument;
};

export function TrustDocumentView({ document }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, fonts, surfaceRadius } = useAppTheme();

  return (
    <View
      // @ts-expect-error web data attribute for print targeting
      dataSet={Platform.OS === 'web' ? { trustPrintRoot: 'true' } : undefined}
      style={[
        styles.root,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          padding: spacing.lg,
          gap: spacing.lg,
        },
      ]}>
      <View style={{ gap: spacing.xs }}>
        <Text
          style={[
            typography.sectionDisplay,
            {
              color: colors.text,
              fontFamily: fonts.display,
              fontSize: 28,
              lineHeight: 34,
            },
          ]}>
          {document.title}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('trustCenter.meta.version', {
            version: document.version,
            updated: document.updatedAt,
          })}
        </Text>
      </View>

      <View style={[styles.rule, { backgroundColor: colors.border }]} />

      {document.sections.map((section) => (
        <View key={section.heading} style={{ gap: spacing.sm }}>
          <Text
            style={[
              typography.headingSemibold,
              {
                color: colors.text,
                fontFamily: fonts.sansSemiBold,
              },
            ]}>
            {section.heading}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text
              key={paragraph.slice(0, 48)}
              style={[typography.body, { color: colors.textSoft, lineHeight: 24 }]}>
              {paragraph}
            </Text>
          ))}
          {section.bullets?.length ? (
            <View style={{ gap: spacing.xs, paddingLeft: spacing.sm }}>
              {section.bullets.map((bullet) => (
                <View key={bullet.slice(0, 48)} style={styles.bulletRow}>
                  <Text style={[typography.body, { color: colors.primary, marginRight: spacing.xs }]}>•</Text>
                  <Text style={[typography.body, { color: colors.textSoft, flex: 1, lineHeight: 24 }]}>
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
        {t('trustCenter.disclaimer.footer')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    width: '100%',
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
