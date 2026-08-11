import { Bot, MessageCircle, Sparkles } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

import { brandTokens } from '@/theme/brand-tokens';

export function gradientPoints(angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    start: { x: 0.5 - 0.5 * Math.cos(rad), y: 0.5 - 0.5 * Math.sin(rad) },
    end: { x: 0.5 + 0.5 * Math.cos(rad), y: 0.5 + 0.5 * Math.sin(rad) },
  };
}

export function WidgetAvatarIcon({
  avatarId,
  avatarUrl,
  size,
  color,
  avatarA11yLabel = 'Chat avatar',
}: {
  avatarId: string;
  avatarUrl?: string | null;
  size: number;
  color: string;
  avatarA11yLabel?: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        accessibilityLabel={avatarA11yLabel}
      />
    );
  }

  if (avatarId === 'bot') return <Bot size={size * 0.55} color={color} />;
  if (avatarId === 'spark') return <Sparkles size={size * 0.55} color={color} />;
  return <MessageCircle size={size * 0.55} color={color} />;
}

export function WidgetAvatarBubble({
  avatarId,
  avatarUrl,
  size,
  color,
  backgroundColor = brandTokens.color.paperRaised,
}: {
  avatarId: string;
  avatarUrl?: string | null;
  size: number;
  color: string;
  backgroundColor?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avatarUrl ? 'transparent' : backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      <WidgetAvatarIcon avatarId={avatarId} avatarUrl={avatarUrl} size={size} color={color} />
    </View>
  );
}

export function formatWidgetRelativeTime(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 45_000) return t('overview.time.justNow');
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return minutes === 1 ? t('overview.time.minuteAgo') : t('overview.time.minutesAgo', { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? t('overview.time.hourAgo') : t('overview.time.hoursAgo', { count: hours });
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function createChatMessageId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
