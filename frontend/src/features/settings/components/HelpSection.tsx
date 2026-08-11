import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  docsUrl: string;
  supportEmail: string;
};

export function HelpSection({ docsUrl, supportEmail }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const [query, setQuery] = React.useState('');
  const resources = React.useMemo(
    () => [
      {
        title: t('help.settings.topics.theme.title'),
        description: t('help.settings.topics.theme.description'),
      },
      {
        title: t('help.settings.topics.retention.title'),
        description: t('help.settings.topics.retention.description'),
      },
      {
        title: t('help.settings.topics.locale.title'),
        description: t('help.settings.topics.locale.description'),
      },
    ],
    [t],
  );
  const filteredResources = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return resources;
    return resources.filter(
      (resource) => resource.title.toLowerCase().includes(normalizedQuery) || resource.description.toLowerCase().includes(normalizedQuery)
    );
  }, [query, resources]);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[styles.buttons, { gap: spacing.xs }]}>
        <AppButton label={t('help.settings.viewDocs')} size="compact" onPress={() => void Linking.openURL(docsUrl)} />
        <AppButton label={t('help.settings.contactSupport')} size="compact" onPress={() => void Linking.openURL(`mailto:${supportEmail}`)} />
      </View>
      <AppTextField
        label={t('help.settings.searchLabel')}
        value={query}
        onChangeText={setQuery}
        placeholder={t('help.settings.searchPlaceholder')}
      />
      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.body, styles.title, { color: colors.text }]}>{t('help.settings.recommendedTopics')}</Text>
        {filteredResources.length ? (
          filteredResources.map((resource) => (
            <View key={resource.title} style={{ gap: 2 }}>
              <Text style={[typography.body, { color: colors.text }]}>{resource.title}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{resource.description}</Text>
            </View>
          ))
        ) : (
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('help.settings.noResults')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  title: {
  },
});
