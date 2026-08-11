import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webSticky } from '@/shared/utils/web-sticky';

type Props = {
  preview: React.ReactNode;
  form: React.ReactNode;
};

/** Reference: `grid gap-6 grid-cols-1 lg:grid-cols-2 lg:items-start` */
export function ChatbotConfigPreviewLayout({ preview, form }: Props) {
  const { spacing } = useAppTheme();
  const { isCompact } = useChatbotConfigLayout();

  if (isCompact) {
    return (
      <View style={{ gap: spacing.lg }}>
        <View style={styles.block}>{form}</View>
        <View style={styles.block}>{preview}</View>
      </View>
    );
  }

  return (
    <View style={[styles.split, { gap: spacing.lg }]}>
      <View style={styles.formCol}>{form}</View>
      <View style={[styles.previewCol, webSticky(24)]}>{preview}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  formCol: {
    flex: 1.15,
    minWidth: 0,
    maxWidth: 560,
  },
  previewCol: {
    flex: 1,
    minWidth: 300,
    maxWidth: 480,
  },
  block: {
    width: '100%',
  },
});
