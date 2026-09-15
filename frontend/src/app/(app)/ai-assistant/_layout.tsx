import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { AiAssistantSidebar } from '@/features/ai-assistant/components/AiAssistantSidebar';
import {
  AiAssistantProvider,
  useAiAssistantContext,
} from '@/features/ai-assistant/providers/ai-assistant-provider';
import { useTranslation } from '@/i18n';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

function AiAssistantWorkspaceShell() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography, radius, surfaceRadius } = useAppTheme();
  const { confirm } = useConfirm();
  const assistant = useAiAssistantContext();
  const isCompact = useCompactLayout();
  const { contentMaxWidth, horizontalPadding, isWeb } = useFeatureScreenLayout();
  const [renameState, setRenameState] = useState<{ id: string; title: string } | null>(null);

  const outerPadH = horizontalPadding ?? spacing.sm;
  const outerPadTop = isWeb ? (isCompact ? spacing.md : spacing.lg) : spacing.md;

  const sidebarProps = {
    sessions: assistant.sessions,
    activeSessionId: assistant.activeSessionId,
    sessionQuery: assistant.sessionQuery,
    onSessionQueryChange: assistant.setSessionQuery,
    onNewChat: () => {
      void assistant.createSession();
      router.push('/(app)/ai-assistant');
    },
    onSelect: (id: string) => {
      void assistant.selectSession(id);
      router.push('/(app)/ai-assistant');
    },
    onRequestRename: (id: string, title: string) => setRenameState({ id, title }),
    onDelete: (id: string) => {
      void confirm({
        title: t('aiAssistant.confirm.deleteTitle'),
        message: t('aiAssistant.confirm.deleteMessage'),
        confirmLabel: t('aiAssistant.delete'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      }).then((ok) => {
        if (ok) void assistant.deleteSession(id);
      });
    },
  };

  const workspaceCard = assistant.loading ? (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: surfaceRadius.card,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: surfaceRadius.card,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <AiAssistantSidebar {...sidebarProps} />
      <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface }}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, width: '100%', backgroundColor: colors.background }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: outerPadH,
          paddingTop: outerPadTop,
          paddingBottom: Platform.OS === 'web' ? spacing.sm : 0,
          gap: spacing.sm,
          minHeight: 0,
        }}
      >
        <PageSectionHeader
          title={t('aiAssistant.title')}
          subtitle={t('aiAssistant.description')}
          style={{ marginTop: 0 }}
        />
        {workspaceCard}
      </View>

      <Modal visible={Boolean(renameState)} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.lg,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              padding: spacing.lg,
              gap: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={[typography.title, { color: colors.text }]}>
              {t('aiAssistant.rename')}
            </Text>
            <TextInput
              value={renameState?.title ?? ''}
              onChangeText={(title) =>
                setRenameState((prev) => (prev ? { ...prev, title } : prev))
              }
              style={[
                typography.body,
                {
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.md,
                  height: 44,
                  color: colors.text,
                },
              ]}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
              <Pressable
                onPress={() => setRenameState(null)}
                style={{
                  height: 40,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={[typography.buttonLabel, { color: colors.textMuted }]}>
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!renameState) return;
                  const title = renameState.title.trim();
                  if (title) void assistant.renameSession(renameState.id, title);
                  setRenameState(null);
                }}
                style={{
                  height: 40,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={[typography.buttonLabel, { color: colors.textOnPrimary }]}>
                  {t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function AiAssistantLayout() {
  return (
    <RouteErrorBoundary pageName="AI Assistant">
      <AiAssistantProvider>
        <AiAssistantWorkspaceShell />
      </AiAssistantProvider>
    </RouteErrorBoundary>
  );
}
