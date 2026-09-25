import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Decorative AI Voice Pilot layout — fake labels only (CE locked teaser). */
export function VoicePilotMock() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const tabs = ['Pilot', 'Voices', 'Settings'];

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[typography.pageDisplay, { color: colors.text }]}>AI Voice Pilot</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Speak to your knowledge base. Hear answers in a natural voice.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {tabs.map((tab, index) => (
          <View
            key={tab}
            style={{
              borderWidth: 1,
              borderColor: index === 0 ? colors.primary : colors.border,
              borderRadius: surfaceRadius.button,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
              backgroundColor: index === 0 ? colors.primaryTint : colors.surface,
            }}>
            <Text
              style={[
                typography.caption,
                { color: index === 0 ? colors.primary : colors.textMuted, fontWeight: '500' },
              ]}>
              {tab}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          padding: spacing.lg,
          backgroundColor: colors.surface,
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: 220,
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            borderWidth: 2,
            borderColor: colors.primary,
            backgroundColor: colors.primaryTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={[typography.caption, { color: colors.primary, fontWeight: '600' }]}>MIC</Text>
        </View>
        <Text style={[typography.caption, { color: colors.textMuted, letterSpacing: 1 }]}>
          LISTENING
        </Text>
        <Text style={[typography.body, { color: colors.textSoft, textAlign: 'center' }]}>
          Tap to speak · answers play aloud
        </Text>
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          padding: spacing.md,
          backgroundColor: colors.surface,
          gap: spacing.xs,
        }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Last question</Text>
        <Text style={[typography.body, { color: colors.textSoft }]}>
          What is our refund policy?
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
          Answer
        </Text>
        <Text style={[typography.body, { color: colors.textSoft }]}>
          Sample spoken reply preview for the locked Enterprise teaser…
        </Text>
      </View>
    </View>
  );
}
