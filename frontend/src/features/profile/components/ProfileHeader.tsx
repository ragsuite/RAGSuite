import { Camera, Globe, Mail } from 'lucide-react-native';
import { Image } from 'expo-image';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { AppButton } from '@/shared/components/app-button';
import { FormCard } from '@/shared/components/form-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useTranslation } from '@/i18n';

type Props = {
  name: string;
  role: string;
  email: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  joinedAt: string;
  avatar: string;
  saving?: boolean;
  compact?: boolean;
  onAvatarPress: () => void;
  onSave: () => void;
};

function formatJoinDate(value: string, unknownLabel: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unknownLabel;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function ProfileHeader({
  name,
  role,
  email,
  jobTitle,
  department,
  location,
  joinedAt,
  avatar,
  saving = false,
  compact = false,
  onAvatarPress,
  onSave,
}: Props) {
  const { colors, radius, typography, spacing, surfaceRadius } = useAppTheme();
  const copy = useProfileCopy();
  const { t } = useTranslation();
  const isWeb = Platform.OS === 'web';
  const dept = department
    ? copy.departments[department as keyof typeof copy.departments] ?? department
    : '';
  const summaryParts = [dept, copy.joined(formatJoinDate(joinedAt, t('profile.summary.unknownDate')))].filter(Boolean);

  return (
    <FormCard>
      <View style={[styles.row, !isWeb || compact ? styles.rowMobile : null]}>
        <View style={styles.infoRow}>
          <View style={styles.avatarWrap}>
            <Image source={{ uri: avatar }} style={[styles.avatar, { borderRadius: surfaceRadius.card, borderColor: colors.border }]} contentFit="cover" />
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
              <Camera size={14} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.identity}>
            <View style={styles.nameRow}>
              <Text numberOfLines={compact ? 1 : 2} style={[typography.title, styles.name, { color: colors.text }]}>
                {name}
              </Text>
              <View style={[styles.badge, { borderRadius: radius.pill, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{role}</Text>
              </View>
            </View>
            {jobTitle ? <Text style={[typography.body, { color: colors.textMuted }]}>{jobTitle}</Text> : null}
            {summaryParts.length ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>{summaryParts.join(' • ')}</Text>
            ) : null}
            <View style={[styles.metaRow, { gap: spacing.md, marginTop: spacing.xs }]}>
              <View style={styles.metaItem}>
                <Mail size={14} color={colors.textMuted} />
                <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
                  {email}
                </Text>
              </View>
              {location ? (
                <View style={styles.metaItem}>
                  <Globe size={14} color={colors.textMuted} />
                  <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
                    {location}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.saveWrap}>
          <AppButton label={saving ? copy.saving : copy.save} onPress={onSave} loading={saving} noTopMargin />
        </View>
      </View>
    </FormCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  rowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 16,
    flex: 1,
    minWidth: 0,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 96,
    height: 96,
    borderWidth: 1,
  },
  avatarEdit: {
    width: 32,
    height: 32,
    position: 'absolute',
    right: -4,
    bottom: -4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 4,
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
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  saveWrap: {
    minWidth: Platform.OS === 'web' ? 160 : undefined,
    width: Platform.OS === 'web' ? undefined : '100%',
  },
});
