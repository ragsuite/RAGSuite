import React from 'react';
import { Bounce, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '@/shared/toast/toastify-overrides.web.css';

import { useSettings } from '@/features/settings/hooks/useSettings';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { MAX_TOASTS } from '@/shared/toast/toast-store';

export function ToastViewport() {
  const { effectiveTheme } = useSettings();

  return (
    <ToastContainer
      position="bottom-right"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick={false}
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      limit={MAX_TOASTS}
      theme={effectiveTheme}
      transition={Bounce}
      style={{ zIndex: overlayTokens.zIndex.content }}
      toastStyle={{ zIndex: overlayTokens.zIndex.content }}
    />
  );
}
