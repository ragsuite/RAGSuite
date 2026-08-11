import { Bounce, toast as toastifyToast, type Id, type ToastOptions as ToastifyOptions } from 'react-toastify';

import { overlayTokens } from '@/shared/constants/overlay-tokens';
import type { ToastId, ToastInput, ToastOptions } from '@/shared/toast/toast.types';
import {
  formatToastifyMessage,
  getToastifyDuration,
  getToastifyId,
  getToastifyType,
} from '@/shared/toast/toast-web-adapter';

const TOASTIFY_Z_INDEX = overlayTokens.zIndex.content;

let toastSequence = 0;

function createWebToastId(): ToastId {
  toastSequence += 1;
  return `toastify-${Date.now()}-${toastSequence}`;
}

function getToastifyOptions(input: ToastInput, options?: ToastOptions): ToastifyOptions {
  const toastId = getToastifyId(input, options) ?? createWebToastId();

  return {
    toastId,
    type: getToastifyType(typeof input === 'string' ? undefined : input.variant),
    position: 'bottom-right',
    autoClose: getToastifyDuration(input, options),
    hideProgressBar: false,
    closeOnClick: false,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
    transition: Bounce,
    style: { zIndex: TOASTIFY_Z_INDEX },
  };
}

function toToastId(id: Id): ToastId {
  return String(id);
}

function webToast(input: ToastInput, options?: ToastOptions): ToastId {
  const message = formatToastifyMessage(input);
  if (!message) return getToastifyId(input, options) ?? '';

  const toastOptions = getToastifyOptions(input, options);
  return toToastId(toastifyToast(message, toastOptions));
}

function webDismiss(id?: ToastId): void {
  if (id !== undefined) {
    toastifyToast.dismiss(id);
    return;
  }
  toastifyToast.dismiss();
}

function webUpdate(id: ToastId, input: ToastInput, options?: ToastOptions): void {
  const message = formatToastifyMessage(input);
  if (!message) return;

  const toastOptions = getToastifyOptions(input, { ...options, id });
  if (toastifyToast.isActive(id)) {
    toastifyToast.update(id, {
      ...toastOptions,
      render: message,
    });
    return;
  }
  toastifyToast(message, toastOptions);
}

/** Module-level stable API — must not allocate new functions per render (breaks useEffect deps). */
const WEB_TOAST_API = {
  toasts: [] as [],
  toast: webToast,
  dismiss: webDismiss,
  update: webUpdate,
  pause: (_id?: ToastId) => undefined,
  resume: (_id?: ToastId) => undefined,
  pauseAll: () => undefined,
  resumeAll: () => undefined,
} as const;

export function useToast() {
  return WEB_TOAST_API;
}
