import axios from 'axios';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useSession } from '@/features/auth/providers/session-provider';
import { API_CONFIG } from '@/network/apiUrl';
import {
  getIsApiUnavailable,
  notifyApiReachable,
  onApiRestored,
  onApiUnavailable,
} from '@/network/api-reachability';
import { ErrorStateCard } from '@/shared/components/error/error-state-card';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/**
 * Full-screen recovery when the backend is unreachable.
 * Matches reference ServerError card UX + network console guidance.
 */
export function ApiUnavailableOverlay() {
  const { isAuthenticated, isBooting } = useSession();
  const { colors } = useAppTheme();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (getIsApiUnavailable() && isAuthenticated && !isBooting) {
      setVisible(true);
    }
    const offUnavailable = onApiUnavailable(() => {
      if (isAuthenticated && !isBooting) setVisible(true);
    });
    const offRestored = onApiRestored(() => setVisible(false));
    return () => {
      offUnavailable();
      offRestored();
    };
  }, [isAuthenticated, isBooting]);

  const probe = useCallback(async () => {
    setRetrying(true);
    try {
      const origin = API_CONFIG.BASE_URL.replace(/\/$/, '');
      try {
        await axios.get(`${origin}/health`, {
          timeout: 5_000,
          headers: { 'ngrok-skip-browser-warning': 'true' },
          withCredentials: Platform.OS === 'web',
        });
        notifyApiReachable();
        setVisible(false);
        return;
      } catch {
        // fall through to /api/v1/system-health
      }

      await axios.get(`${origin}${API_CONFIG.SYSTEM_HEALTH}`, {
        timeout: 5_000,
        headers: { 'ngrok-skip-browser-warning': 'true' },
        withCredentials: Platform.OS === 'web',
        validateStatus: (status) => status > 0 && status < 500,
      });
      notifyApiReachable();
      setVisible(false);
    } catch {
      setVisible(true);
    } finally {
      setRetrying(false);
    }
  }, []);

  if (!visible || !isAuthenticated || isBooting) return null;

  return (
    <View
      style={[
        styles.overlay,
        {
          backgroundColor: colors.background,
          zIndex: overlayTokens.zIndex.content + 50,
        },
      ]}
      pointerEvents="auto">
      <ErrorStateCard
        variant="network"
        primaryLoading={retrying}
        onPrimary={() => {
          void probe();
        }}
        onSecondary={() => {
          try {
            router.replace('/(app)/(tabs)');
          } catch {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.location.reload();
            }
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
