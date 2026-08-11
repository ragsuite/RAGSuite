import { useEffect, useRef } from 'react';

import type { ToastVariant } from '@/shared/toast/toast.types';
import { useToastRef } from '@/shared/toast/use-toast-ref';

type Feedback = {
  type: 'success' | 'error';
  message: string;
} | null;

type Props = {
  feedback: Feedback;
  onDismiss?: () => void;
};

export function ToastFeedbackBridge({ feedback, onDismiss }: Props) {
  const toastRef = useToastRef();
  const lastKeyRef = useRef<string | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!feedback) {
      lastKeyRef.current = null;
      return;
    }

    const key = `${feedback.type}:${feedback.message}`;
    if (lastKeyRef.current === key) return;

    lastKeyRef.current = key;
    toastRef.current({
      description: feedback.message,
      variant: feedback.type as ToastVariant,
    });
    onDismissRef.current?.();
  }, [feedback, toastRef]);

  return null;
}
