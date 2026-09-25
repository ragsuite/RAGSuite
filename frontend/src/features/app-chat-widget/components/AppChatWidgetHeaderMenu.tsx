import { CircleX, Mail, Menu } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import { createTranslatorForLanguage } from '@/i18n';
import { ActionIcons } from '@/shared/constants/action-icons';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type HeaderIconStyle = (state: {
  pressed: boolean;
  hovered?: boolean;
}) => object | object[];

type MenuProps = {
  theme: AppChatWidgetTheme;
  sessionEmpty: boolean;
  previewMode?: boolean;
  /** Hide Pop out when already in a standalone pop-out window. */
  showPopOut?: boolean;
  /**
   * Voice Pilot surface: only Pop out (hide translate / email / end).
   * Chat thread menus stay full. Language picker is separate in the header.
   */
  popOutOnly?: boolean;
  /** When false, hide End session (Layout 2 readonly threads). */
  allowEndSession?: boolean;
  /** Effective visitor/admin language (e.g. de) — not the dashboard UI locale. */
  language?: string | null;
  translatingChat?: boolean;
  canTranslateChat?: boolean;
  headerIconStyle: HeaderIconStyle;
  onPopOut: () => void;
  onRequestEmailConversation: () => void;
  onRequestEndSession: () => void;
  onTranslateChat?: () => void;
};

export function AppChatWidgetHeaderMenu({
  theme,
  sessionEmpty,
  previewMode = false,
  showPopOut = true,
  popOutOnly = false,
  allowEndSession = true,
  language,
  translatingChat = false,
  canTranslateChat = false,
  headerIconStyle,
  onPopOut,
  onRequestEmailConversation,
  onRequestEndSession,
  onTranslateChat,
}: MenuProps) {
  const t = createTranslatorForLanguage(language);
  const { surfaceRadius } = useAppTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const handlePopOut = () => {
    closeMenu();
    if (previewMode) return;
    onPopOut();
  };

  const handleRequestEmailConversation = () => {
    closeMenu();
    onRequestEmailConversation();
  };

  const handleRequestEndSession = () => {
    closeMenu();
    if (previewMode) return;
    onRequestEndSession();
  };

  const handleTranslateChat = () => {
    if (!canTranslateChat || translatingChat) return;
    closeMenu();
    // Allow translate in preview and live — only pop-out / end-session stay preview-gated.
    onTranslateChat?.();
  };

  const showTranslate = !popOutOnly && canTranslateChat;
  const showEmailConversation = !popOutOnly && !sessionEmpty;
  const showEndSession = !popOutOnly && allowEndSession && !sessionEmpty;
  const hasMenuItems = showTranslate || showPopOut || showEmailConversation || showEndSession;
  // Already in a pop-out window on Voice Pilot — nothing useful to show.
  if ((popOutOnly && !showPopOut) || !hasMenuItems) return null;

  return (
    <View style={styles.triggerWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chatbot.widget.app.menu.a11y')}
        accessibilityState={{ expanded: menuOpen }}
        onPress={() => setMenuOpen((open) => !open)}
        style={headerIconStyle}>
        <Menu size={20} color={theme.headerTextColor} strokeWidth={2} />
      </Pressable>

      {menuOpen ? (
        <>
          <Pressable
            accessibilityLabel={t('chatbot.widget.app.menu.dismiss.a11y')}
            onPress={closeMenu}
            style={[
              styles.menuDismiss,
              Platform.OS === 'web' ? (styles.menuDismissWeb as object) : null,
            ]}
          />
          <View
            style={[
              styles.menuCard,
              {
                backgroundColor: theme.panelBg,
                borderColor: theme.panelBorderColor,
                borderRadius: surfaceRadius.button,
              },
            ]}
            accessibilityRole="menu">
            {showTranslate ? (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel={t('chatbot.widget.app.translateChat')}
                accessibilityState={{ disabled: translatingChat }}
                disabled={translatingChat}
                onPress={handleTranslateChat}
                style={({ pressed, hovered }) => [
                  styles.menuRow,
                  {
                    backgroundColor:
                      pressed || Boolean(hovered) ? theme.inputSectionBg : 'transparent',
                    borderRadius: Math.max(6, surfaceRadius.button - 4),
                    opacity: translatingChat ? 0.6 : 1,
                  },
                ]}>
                <ActionIcons.refresh size={16} color={theme.heroTitleColor} />
                <Text style={[styles.menuRowLabel, { color: theme.heroTitleColor }]} numberOfLines={1}>
                  {translatingChat
                    ? t('chatbot.widget.app.translateChat.loading')
                    : t('chatbot.widget.app.translateChat')}
                </Text>
              </Pressable>
            ) : null}

            {showPopOut ? (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel={t('chatbot.widget.app.menu.popOut')}
                onPress={handlePopOut}
                style={({ pressed, hovered }) => [
                  styles.menuRow,
                  {
                    backgroundColor:
                      pressed || Boolean(hovered) ? theme.inputSectionBg : 'transparent',
                    borderRadius: Math.max(6, surfaceRadius.button - 4),
                  },
                ]}>
                <ActionIcons.externalLink size={16} color={theme.heroTitleColor} />
                <Text style={[styles.menuRowLabel, { color: theme.heroTitleColor }]} numberOfLines={1}>
                  {t('chatbot.widget.app.menu.popOut')}
                </Text>
              </Pressable>
            ) : null}

            {showEmailConversation ? (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel={t('chatbot.widget.app.menu.emailConversation')}
                onPress={handleRequestEmailConversation}
                style={({ pressed, hovered }) => [
                  styles.menuRow,
                  {
                    backgroundColor:
                      pressed || Boolean(hovered) ? theme.inputSectionBg : 'transparent',
                    borderRadius: Math.max(6, surfaceRadius.button - 4),
                  },
                ]}>
                <Mail size={16} color={theme.heroTitleColor} strokeWidth={1.75} />
                <Text style={[styles.menuRowLabel, { color: theme.heroTitleColor }]} numberOfLines={1}>
                  {t('chatbot.widget.app.menu.emailConversation')}
                </Text>
              </Pressable>
            ) : null}

            {showEndSession ? (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel={t('chatbot.widget.app.menu.endSession')}
                onPress={handleRequestEndSession}
                style={({ pressed, hovered }) => [
                  styles.menuRow,
                  {
                    backgroundColor:
                      pressed || Boolean(hovered) ? theme.inputSectionBg : 'transparent',
                    borderRadius: Math.max(6, surfaceRadius.button - 4),
                  },
                ]}>
                <CircleX size={16} color={theme.heroTitleColor} strokeWidth={1.75} />
                <Text style={[styles.menuRowLabel, { color: theme.heroTitleColor }]} numberOfLines={1}>
                  {t('chatbot.widget.app.menu.endSession')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

type ConfirmProps = {
  theme: AppChatWidgetTheme;
  /** Chatbot widget language (e.g. de) — not the dashboard UI locale. */
  language?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AppChatWidgetEndSessionConfirm({ theme, language, onCancel, onConfirm }: ConfirmProps) {
  const t = createTranslatorForLanguage(language);
  const { surfaceRadius } = useAppTheme();

  return (
    <View style={styles.confirmOverlay} accessibilityViewIsModal>
      <Pressable
        accessibilityLabel={t('chatbot.widget.app.endSession.confirm.dismiss.a11y')}
        style={[styles.confirmBackdrop, { backgroundColor: overlayTokens.backdrop }]}
        onPress={onCancel}
      />
      <View
        style={[
          styles.confirmCard,
          {
            backgroundColor: theme.panelBg,
            borderColor: theme.panelBorderColor,
            borderRadius: surfaceRadius.modal,
          },
        ]}>
        <Text style={[styles.confirmMessage, { color: theme.heroTitleColor }]}>
          {t('chatbot.widget.app.endSession.confirm.message')}
        </Text>
        <View style={styles.confirmActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            onPress={onCancel}
            style={({ pressed, hovered }) => [
              styles.confirmBtn,
              {
                backgroundColor: theme.inputSectionBg,
                borderColor: theme.panelBorderColor,
                borderRadius: surfaceRadius.button,
                borderWidth: 1,
                opacity: pressed || Boolean(hovered) ? 0.9 : 1,
              },
            ]}>
            <Text style={[styles.confirmBtnLabel, { color: theme.heroTitleColor }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.app.endSession.confirm.confirm')}
            onPress={onConfirm}
            style={({ pressed, hovered }) => [
              styles.confirmBtn,
              {
                backgroundColor: theme.accentColor,
                borderRadius: surfaceRadius.button,
                opacity: pressed || Boolean(hovered) ? 0.9 : 1,
              },
            ]}>
            <Text style={[styles.confirmBtnLabel, { color: theme.accentForegroundColor }]}>
              {t('chatbot.widget.app.endSession.confirm.confirm')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  triggerWrap: {
    position: 'relative',
    zIndex: 5,
  },
  menuDismiss: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  menuDismissWeb: {
    position: 'fixed' as unknown as 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  menuCard: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    minWidth: 220,
    maxWidth: 280,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    zIndex: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
      },
      default: {
        elevation: 6,
      },
    }),
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    padding: 18,
    gap: 16,
    zIndex: 1,
  },
  confirmMessage: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 88,
    alignItems: 'center',
  },
  confirmBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
