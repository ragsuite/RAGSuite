import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { AppSelectField } from '@/shared/components/app-select-field';

type Option<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

export function CrawlFilterSelect<T extends string>({ value, options, onChange, accessibilityLabel }: Props<T>) {
  const isCompact = useCrawlCompactLayout();

  return (
    <View style={[styles.root, isCompact && styles.rootMobile, !isCompact && styles.rootWeb]}>
      <AppSelectField
        label=""
        variant="inline"
        value={value}
        options={options}
        onChange={onChange}
        accessibilityLabel={accessibilityLabel}
        pickerTitle={accessibilityLabel}
        controlHeight={TOOLBAR_CONTROL_HEIGHT}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minWidth: 140,
    flex: Platform.OS === 'web' ? 0 : undefined,
  },
  rootWeb: {
    height: TOOLBAR_CONTROL_HEIGHT,
  },
  rootMobile: {
    width: '100%',
    minWidth: undefined,
    flex: undefined,
    height: undefined,
  },
});
