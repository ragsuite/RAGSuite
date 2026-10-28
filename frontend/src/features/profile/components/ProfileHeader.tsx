import { Camera } from 'lucide-react-native';
import { Image } from 'expo-image';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useTranslation } from '@/i18n';

type Props = {
  name: string;
  role: string;
  jobTitle?: string;
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
  joinedAt,
  avatar,
  compact = false,
  readOnly = false,
  onAvatarPress,
}: Props) {
  const { colors, radius, typography, spacing } = useAppTheme();
  const copy = useProfileCopy();
  const { t } = useTranslation();
  const updateLabel = t('profile.avatar.updateLabel');
  const summaryParts = [
    jobTitle,
    copy.joined(formatJoinDate(joinedAt, t('profile.summary.unknownDate'))),
  ].filter(Boolean);

  return (
    <View style={styles.wrap}>
      <View style={styles.infoRow}>
        {readOnly ? (
          <Image
            source={{ uri: avatar }}
            style={[styles.avatar, { borderColor: colors.border }]}
            contentFit="cover"
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={updateLabel}
            onPress={onAvatarPress}
            style={[
              styles.avatarHit,
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as unknown as ViewStyle) : null,
            ]}>
            {({ pressed, hovered }) => (
              <>
                <View
                  style={[
                    styles.avatarPress,
                    {
                      borderColor: colors.primary,
                      backgroundColor: colors.primaryTint,
                    },
                  ]}>
                  <Image source={{ uri: avatar }} style={styles.avatarImage} contentFit="cover" />
                  {pressed || hovered ? (
                    <View style={[styles.avatarScrim, { backgroundColor: 'rgba(15, 31, 28, 0.5)' }]}>
                      <Camera size={20} color={colors.textOnPrimary} />
                    </View>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.avatarBadge,
                    {
                      backgroundColor: colors.primary,
                      borderColor: colors.surface,
                    },
                  ]}>
                  <Camera size={12} color={colors.textOnPrimary} />
                </View>
              </>
            )}
          </Pressable>
        )}

        <View style={[styles.identity, { gap: spacing.xs }]}>
          <View style={styles.nameRow}>
            <Text
              numberOfLines={compact ? 1 : 2}
              style={[typography.body, styles.name, { color: colors.text }]}>
              {name}
            </Text>
            <View
              style={[
                styles.roleBadge,
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

const AVATAR_SIZE = 72;

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minWidth: 0,
  },
  avatarHit: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    position: 'relative',
    flexShrink: 0,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1,
  },
  avatarPress: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarScrim: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flexShrink: 1,
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
  roleBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
