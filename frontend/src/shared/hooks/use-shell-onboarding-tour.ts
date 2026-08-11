import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/features/auth/providers/session-provider';
import { storage } from '@/services/storage/storage';

const ONBOARDING_STORAGE_KEY = 'ragsuite-onboarding';

type OnboardingState = {
  hasSeenTour: boolean;
  completedSteps: string[];
  currentProgress: number;
};

const defaultState: OnboardingState = {
  hasSeenTour: false,
  completedSteps: [],
  currentProgress: 0,
};

function storageKeyForUser(userId?: string | null) {
  return userId ? `${ONBOARDING_STORAGE_KEY}-${userId}` : ONBOARDING_STORAGE_KEY;
}

export function useShellOnboardingTour() {
  const { session } = useSession();
  const storageKey = storageKeyForUser(session?.user?.id);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await storage.getItem(storageKey);
      if (cancelled) return;
      if (stored) {
        try {
          setOnboardingState(JSON.parse(stored) as OnboardingState);
        } catch {
          setOnboardingState(defaultState);
        }
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const persist = useCallback(
    async (next: OnboardingState) => {
      setOnboardingState(next);
      await storage.setItem(storageKey, JSON.stringify(next));
    },
    [storageKey],
  );

  const completeTour = useCallback(async () => {
    setIsTourActive(false);
    await persist({
      ...onboardingState,
      hasSeenTour: true,
      currentProgress: 100,
    });
  }, [onboardingState, persist]);

  const skipTour = useCallback(async () => {
    setIsTourActive(false);
    await persist({
      ...onboardingState,
      hasSeenTour: true,
      currentProgress: 0,
    });
  }, [onboardingState, persist]);

  const startTour = useCallback(() => {
    setIsTourActive(true);
  }, []);

  useEffect(() => {
    if (!hydrated || onboardingState.hasSeenTour || isTourActive) return;
    const timer = setTimeout(() => setIsTourActive(true), 2000);
    return () => clearTimeout(timer);
  }, [hydrated, onboardingState.hasSeenTour, isTourActive]);

  return {
    isTourActive,
    startTour,
    completeTour,
    skipTour,
    hasSeenTour: onboardingState.hasSeenTour,
  };
}
