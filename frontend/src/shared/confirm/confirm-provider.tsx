import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';

import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  /** When true, dims the page behind the dialog (e.g. sign-out). Default is undimmed. */
  dimBackdrop?: boolean;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type PendingConfirm = {
  options: ConfirmOptions;
};

type Props = {
  children: React.ReactNode;
};

type FocusableWebElement = {
  focus: () => void;
};

type WebDocumentLike = {
  activeElement: unknown;
  getElementById: (id: string) => FocusableWebElement | null;
};

type WebKeyboardEventLike = {
  key?: string;
  shiftKey?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

type WebWindowLike = {
  addEventListener: (type: 'keydown', listener: (event: WebKeyboardEventLike) => void) => void;
  removeEventListener: (type: 'keydown', listener: (event: WebKeyboardEventLike) => void) => void;
};

function getWebDocument(): WebDocumentLike | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as typeof globalThis & { document?: WebDocumentLike }).document ?? null;
}

function getWebWindow(): WebWindowLike | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as typeof globalThis & { window?: WebWindowLike }).window ?? null;
}

function isFocusableWebElement(element: unknown): element is FocusableWebElement {
  return Boolean(element && typeof (element as FocusableWebElement).focus === 'function');
}

export function ConfirmProvider({ children }: Props) {
  const { colors, spacing, typography, surfaceRadius, elevation } = useAppTheme();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const restoreFocusRef = useRef<FocusableWebElement | null>(null);
  const idBase = useId().replace(/:/g, '');
  const titleId = `confirm-${idBase}-title`;
  const messageId = `confirm-${idBase}-message`;
  const cancelButtonId = `confirm-${idBase}-cancel`;
  const confirmButtonId = `confirm-${idBase}-confirm`;

  const settle = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    resolverRef.current?.(false);
    const activeElement = getWebDocument()?.activeElement;
    restoreFocusRef.current = isFocusableWebElement(activeElement) ? activeElement : null;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({ options });
    });
  }, []);

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);
  const options = pending?.options;
  const webDialogProps = useMemo(
    () => (Platform.OS === 'web' && options
      ? ({
          role: options.destructive ? 'alertdialog' : 'dialog',
          'aria-modal': true,
          'aria-labelledby': titleId,
          'aria-describedby': messageId,
          tabIndex: -1,
        } as Record<string, unknown>)
      : {}),
    [messageId, options, titleId],
  );

  useEffect(() => {
    if (!options) {
      const elementToRestore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (Platform.OS !== 'web' || !elementToRestore) return undefined;

      const timer = setTimeout(() => {
        elementToRestore.focus();
      }, 0);
      return () => clearTimeout(timer);
    }

    if (Platform.OS !== 'web') return undefined;
    const timer = setTimeout(() => {
      getWebDocument()?.getElementById(cancelButtonId)?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [cancelButtonId, options]);

  useEffect(() => {
    if (!options || Platform.OS !== 'web') return undefined;
    const webWindow = getWebWindow();
    if (!webWindow) return undefined;

    const handleKeyDown = (event: WebKeyboardEventLike) => {
      if (event.key === 'Escape') {
        event.preventDefault?.();
        event.stopPropagation?.();
        settle(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const webDocument = getWebDocument();
      const cancelButton = webDocument?.getElementById(cancelButtonId);
      const confirmButton = webDocument?.getElementById(confirmButtonId);
      if (!cancelButton || !confirmButton) return;

      const activeElement = webDocument?.activeElement;
      const moveFocusInsideModal = (element: FocusableWebElement) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        element.focus();
      };

      if (event.shiftKey && activeElement === cancelButton) {
        moveFocusInsideModal(confirmButton);
      } else if (!event.shiftKey && activeElement === confirmButton) {
        moveFocusInsideModal(cancelButton);
      } else if (activeElement !== cancelButton && activeElement !== confirmButton) {
        moveFocusInsideModal(event.shiftKey ? confirmButton : cancelButton);
      }
    };

    webWindow.addEventListener('keydown', handleKeyDown);
    return () => webWindow.removeEventListener('keydown', handleKeyDown);
  }, [cancelButtonId, confirmButtonId, options, settle]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        visible={Boolean(options)}
        transparent
        animationType="fade"
        onRequestClose={() => settle(false)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={options?.cancelLabel}
          onPress={() => settle(false)}
          style={[
            styles.backdrop,
            {
              backgroundColor: options?.dimBackdrop ? colors.pineDeep : 'transparent',
              padding: spacing.md,
            },
          ]}>
          {options ? (
            <Pressable
              {...webDialogProps}
              accessibilityRole={Platform.OS === 'web' ? undefined : options.destructive ? 'alert' : undefined}
              accessibilityLabel={options.title}
              accessibilityViewIsModal
              importantForAccessibility="yes"
              onAccessibilityEscape={() => settle(false)}
              onPress={(event) => {
                // Keep presses on the card from dismissing via the backdrop.
                event.stopPropagation?.();
              }}
              style={[
                styles.card,
                elevation.raised,
                {
                  borderRadius: surfaceRadius.modal,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: spacing.md,
                  gap: spacing.sm,
                },
              ]}>
              <View style={[styles.titleRow, { gap: spacing.sm }]}>
                <View
                  style={[
                    styles.iconWrap,
                    {
                      borderRadius: surfaceRadius.button,
                      backgroundColor: options.destructive ? colors.dangerBackground : colors.primaryTint,
                    },
                  ]}>
                  <TriangleAlert size={16} color={options.destructive ? colors.danger : colors.primary} />
                </View>
                <Text nativeID={titleId} style={[typography.subtitle, styles.title, { color: colors.text }]}>
                  {options.title}
                </Text>
              </View>
              <Text nativeID={messageId} style={[typography.body, { color: colors.textSoft }]}>
                {options.message}
              </Text>
              <View style={[styles.actions, { gap: spacing.xs }]}>
                <AppButton
                  nativeID={cancelButtonId}
                  label={options.cancelLabel}
                  variant="outline"
                  onPress={() => settle(false)}
                />
                <AppButton
                  nativeID={confirmButtonId}
                  label={options.confirmLabel}
                  variant={options.destructive ? 'danger' : 'primary'}
                  onPress={() => settle(true)}
                />
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used inside ConfirmProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
});
