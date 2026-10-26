import { Camera } from 'lucide-react-native';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useTranslation } from '@/i18n';

type Props = {
  name: string;
  role: string;
  jobTitle?: string;
  department?: string;
  joinedAt: string;
  avatar: string;
  compact?: boolean;
  readOnly?: boolean;
  onAvatarPress: () => void;
};

function formatJoinDate(value: string, unknownLabel: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unknownLabel;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function ProfileHeader({
  name,
  role,
  jobTitle,
  department,
  joinedAt,
  avatar,
  compact = false,
  readOnly = false,
  onAvatarPress,
}: Props) {
  const { colors, radius, typography, surfaceRadius } = useAppTheme();
  const copy = useProfileCopy();
  const { t } = useTranslation();
  const dept = department
    ? copy.departments[department as keyof typeof copy.departments] ?? department
    : '';
  const summaryParts = [
    jobTitle,
    dept,
    copy.joined(formatJoinDate(joinedAt, t('profile.summary.unknownDate'))),
  ].filter(Boolean);

  return (
    <View style={styles.wrap}>
      <View style={styles.infoRow}>
        <View style={styles.avatarWrap}>
          <Image
            source={{ uri: avatar }}
            style={[styles.avatar, { borderRadius: surfaceRadius.card, borderColor: colors.border }]}
            contentFit="cover"
          />
          {readOnly ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.avatar.updateLabel')}
              onPress={onAvatarPress}
              style={({ pressed }) => [
                styles.avatarEdit,
                {
                  borderRadius: surfaceRadius.button,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              <Camera size={10} color={colors.text} />
            </Pressable>
          )}
        </View>

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text
              numberOfLines={compact ? 1 : 2}
              style={[typography.body, styles.name, { color: colors.text }]}>
              {name}
            </Text>
            <View
              style={[
                styles.badge,
                {
                  borderRadius: radius.pill,
                  borderColor: colors.primary,
                  backgroundColor: colors.primaryTint,
                },
              ]}>
              <Text style={[typography.caption, { color: colors.onPrimaryTint }]}>{role}</Text>
            </View>
          </View>
          {summaryParts.length ? (
            <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
              {summaryParts.join(' • ')}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderWidth: 1,
  },
  avatarEdit: {
    width: 20,
    height: 20,
    position: 'absolute',
    right: -4,
    bottom: -4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flexShrink: 1,
    gap: 2,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    flexShrink: 1,
    fontWeight: '600',
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
