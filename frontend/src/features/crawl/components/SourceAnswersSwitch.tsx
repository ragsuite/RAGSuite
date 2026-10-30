import React from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import {
  useSourceAnswersToggle,
  type SourceAnswersChange,
  type SourceAnswersState,
} from '@/features/crawl/hooks/use-source-answers-toggle';
import { useFieldWriteLock } from '@/features/organization/hooks/use-module-write';
import { useTranslation } from '@/i18n';
import { InfoHintButton } from '@/shared/components/info-hint-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webLockedCursor } from '@/shared/utils/web-locked-cursor';

type Props = SourceAnswersState & {
  /** Source name read out by screen readers. */
  name: string;
  onChange: SourceAnswersChange;
};

const LOCK_HINT_KEYS = {
  running: 'crawl.table.answers.lockedRunning',
  empty: 'crawl.table.answers.lockedEmpty',
} as const;

/** Per-source switch that includes or excludes the source from every chat and search answer. */
export function SourceAnswersSwitch({ name, onChange, ...state }: Props) {
  const { colors, spacing } = useAppTheme();
  const { t } = useTranslation();
  const { value, pending, lockReason, disabled, toggle } = useSourceAnswersToggle(state, onChange);
  const locked = useFieldWriteLock(disabled);
  const label = t('crawl.table.answers.a11y', { name });
  const hint = lockReason ? t(LOCK_HINT_KEYS[lockReason]) : t('crawl.table.answers.hint');

  return (
    <View style={[styles.root, { gap: spacing.xxs }]}>
      {/* Lock only the switch — the (i) hint must stay clickable while training. */}
      <View
        style={[locked ? styles.dimmed : undefined, webLockedCursor(locked)]}
        pointerEvents={locked ? 'none' : 'auto'}
      >
        <Switch
          accessibilityLabel={label}
          accessibilityHint={hint}
          accessibilityRole="switch"
          accessibilityState={{ checked: value, disabled: locked, busy: pending }}
          value={value}
          disabled={locked}
          onValueChange={(next) => void toggle(next)}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={Platform.OS === 'android' ? (value ? colors.textOnPrimary : colors.surface) : colors.surface}
          ios_backgroundColor={colors.surfaceMuted}
        />
      </View>
      {lockReason ? (
        <InfoHintButton
          title={t('crawl.table.answers.lockedTitle')}
          body={hint}
          accessibilityLabel={t('crawl.table.answers.lockedA11y')}
          iconSize={14}
          popoverWidth={240}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dimmed: { opacity: 0.5 },
});
