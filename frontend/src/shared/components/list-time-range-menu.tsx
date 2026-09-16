import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import type { ListTimeRange } from '@/shared/utils/list-time-range';

const TIME_RANGE_OPTIONS: { key: ListTimeRange; labelKey: string }[] = [
  { key: 'all', labelKey: 'chatbot.history.filter.allTime' },
  { key: 'today', labelKey: 'chatbot.history.filter.today' },
  { key: '7d', labelKey: 'chatbot.history.filter.last7Days' },
  { key: '30d', labelKey: 'chatbot.history.filter.last30Days' },
  { key: 'year', labelKey: 'chatbot.history.filter.lastYear' },
];

type Props = {
  timeRange: ListTimeRange;
  onTimeRangeChange: (range: ListTimeRange) => void;
  fullWidth?: boolean;
  controlHeight?: number;
  inlineMinWidth?: number;
};

export function ListTimeRangeMenu({
  timeRange,
  onTimeRangeChange,
  fullWidth,
  controlHeight = TOOLBAR_CONTROL_HEIGHT,
  inlineMinWidth = 148,
}: Props) {
  const { t } = useTranslation();
  const options = useMemo(
    () =>
      TIME_RANGE_OPTIONS.map((option) => ({
        key: option.key,
        label: t(option.labelKey),
      })),
    [t],
  );

  return (
    <View style={fullWidth ? styles.fullWidth : [styles.inline, { height: controlHeight }]}>
      <AppSelectField
        label=""
        variant="inline"
        value={timeRange}
        options={options}
        onChange={onTimeRangeChange}
        accessibilityLabel={t('chatbot.history.timeRange.label')}
        pickerTitle={t('chatbot.history.timeRange.label')}
        controlHeight={controlHeight}
        inlineMinWidth={fullWidth ? undefined : inlineMinWidth}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  inline: {
    width: 148,
    flexShrink: 0,
  },
});
