import { CircleX, Menu } from 'lucide-react-native';
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
  /** Chatbot widget language (e.g. de) — not the dashboard UI locale. */
  language?: string | null;
  headerIconStyle: HeaderIconStyle;
  onPopOut: () => void;
  onRequestEndSession: () => void;
};

export function AppChatWidgetHeaderMenu({
  theme,
  sessionEmpty,
  previewMode = false,
  showPopOut = true,
  language,
  headerIconStyle,
  onPopOut,
  onRequestEndSession,
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

  const closeMenu = () => setMenuOpen(false);

  const handlePopOut = () => {
    closeMenu();
    if (previewMode) return;
    onPopOut();
  };

  const handleRequestEndSession = () => {
    closeMenu();
    if (previewMode) return;
    onRequestEndSession();
  };

  const showEndSession = !sessionEmpty;

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
  );
}

const styles = StyleSheet.create({
  triggerWrap: {
    position: 'relative',
    zIndex: 6,
  },
  menuDismiss: {
    position: 'absolute',
    top: -4000,
    right: -4000,
    bottom: -4000,
    left: -4000,
    zIndex: 5,
  },
  menuDismissWeb: {
    position: 'fixed',
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
    minWidth: 200,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 7,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      },
      default: {
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  menuRowLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 280,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    zIndex: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
      },
      default: {
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      },
    }),
  },
  confirmMessage: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    marginBottom: 4,
  },
  confirmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  confirmBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
