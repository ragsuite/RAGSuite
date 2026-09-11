import { Home, MessageCircle } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';

export type AppChatWidgetLayoutTab = 'home' | 'messages';

type Props = {
  activeTab: AppChatWidgetLayoutTab;
  accentColor: string;
  mutedColor: string;
  borderColor: string;
  backgroundColor: string;
  onChangeTab: (tab: AppChatWidgetLayoutTab) => void;
};

export function AppChatWidgetTabBar({
  activeTab,
  accentColor,
  mutedColor,
  borderColor,
  backgroundColor,
  onChangeTab,
}: Props) {
  const { t } = useTranslation();
  const inactive = mutedColor || '#9CA3AF';

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: backgroundColor || '#FFFFFF',
          borderTopColor: borderColor || 'rgba(0,0,0,0.08)',
        },
      ]}
    >
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'home' }}
        accessibilityLabel={t('chatbot.widget.layout2.tab.home')}
        onPress={() => onChangeTab('home')}
        style={styles.tab}
      >
        <Home
          size={22}
          color={activeTab === 'home' ? accentColor : inactive}
          strokeWidth={activeTab === 'home' ? 2.35 : 2}
        />
        <Text
          style={[
            styles.label,
            { color: activeTab === 'home' ? accentColor : inactive },
          ]}
          numberOfLines={1}
        >
          {t('chatbot.widget.layout2.tab.home')}
        </Text>
        <View
          style={[
            styles.indicator,
            {
              backgroundColor:
                activeTab === 'home' ? accentColor : 'transparent',
            },
          ]}
        />
      </Pressable>

      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'messages' }}
        accessibilityLabel={t('chatbot.widget.layout2.tab.messages')}
        onPress={() => onChangeTab('messages')}
        style={styles.tab}
      >
        <MessageCircle
          size={22}
          color={activeTab === 'messages' ? accentColor : inactive}
          strokeWidth={activeTab === 'messages' ? 2.35 : 2}
        />
        <Text
          style={[
            styles.label,
            { color: activeTab === 'messages' ? accentColor : inactive },
          ]}
          numberOfLines={1}
        >
          {t('chatbot.widget.layout2.tab.messages')}
        </Text>
        <View
          style={[
            styles.indicator,
            {
              backgroundColor:
                activeTab === 'messages' ? accentColor : 'transparent',
            },
          ]}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 60,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  indicator: {
    marginTop: 4,
    height: 2.5,
    width: 26,
    borderRadius: 2,
  },
});
