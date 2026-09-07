import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { AppConfirmDialog } from '@/shared/confirm/app-confirm-dialog';
import {
  resolveConfirmVariant,
  type ConfirmVariant,
} from '@/shared/confirm/confirm-variant';

export type { ConfirmVariant };

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Prefer `variant`. Maps to danger when variant is omitted. */
  destructive?: boolean;
  /**
   * @deprecated Backdrop is always blurred/dimmed. Accepted for call-site compatibility.
   */
  dimBackdrop?: boolean;
  variant?: ConfirmVariant;
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
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const restoreFocusRef = useRef<FocusableWebElement | null>(null);
  const idBase = useId().replace(/:/g, '');
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
  const variant = options
    ? resolveConfirmVariant({ variant: options.variant, destructive: options.destructive })
    : 'confirm';

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
      <AppConfirmDialog
        visible={Boolean(options)}
        title={options?.title ?? ''}
        message={options?.message}
        cancelLabel={options?.cancelLabel ?? ''}
        confirmLabel={options?.confirmLabel ?? ''}
        variant={variant}
        showCloseButton={false}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
      />
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
