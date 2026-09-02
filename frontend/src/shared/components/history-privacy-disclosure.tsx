import React from 'react';
import { Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  historyEnabled: boolean;
  i18nPrefix: string;
};

export function HistoryPrivacyDisclosure({ historyEnabled, i18nPrefix }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();

  const storedKeys = [
    `${i18nPrefix}.disclosure.stored.item1`,
    `${i18nPrefix}.disclosure.stored.item2`,
    `${i18nPrefix}.disclosure.stored.item3`,
    `${i18nPrefix}.disclosure.stored.item4`,
  ] as const;

  const notStoredKeys = [
    `${i18nPrefix}.disclosure.notStored.item1`,
    `${i18nPrefix}.disclosure.notStored.item2`,
    `${i18nPrefix}.disclosure.notStored.item3`,
    `${i18nPrefix}.disclosure.notStored.item4`,
  ] as const;

  const alwaysKeys = [
    `${i18nPrefix}.disclosure.always.item1`,
    `${i18nPrefix}.disclosure.always.item2`,
    `${i18nPrefix}.disclosure.always.item3`,
    `${i18nPrefix}.disclosure.always.item4`,
  ] as const;

  const activeKeys = historyEnabled ? storedKeys : notStoredKeys;
  const ttlMinutes = historyEnabled ? 30 : 15;

  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text style={[typography.label, { color: colors.text }]}>
        {t(historyEnabled ? `${i18nPrefix}.disclosure.stored.title` : `${i18nPrefix}.disclosure.notStored.title`)}
      </Text>
      {activeKeys.map((key) => (
        <Text key={key} style={[typography.bodySmall, { color: colors.textMuted }]}>
          {'• '}
          {t(key)}
        </Text>
      ))}
      <Text style={[typography.label, { color: colors.text, marginTop: spacing.sm }]}>
        {t(`${i18nPrefix}.disclosure.always.title`)}
      </Text>
      {alwaysKeys.map((key) => (
        <Text key={key} style={[typography.bodySmall, { color: colors.textMuted }]}>
          {'• '}
          {t(key, { minutes: ttlMinutes })}
        </Text>
      ))}
    </View>
  );
}
