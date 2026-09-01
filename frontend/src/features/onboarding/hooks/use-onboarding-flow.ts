import { useCallback, useEffect, useState } from 'react';

import { brandingSchema, projectSchema } from '@/features/onboarding/onboarding.schema';
import type { OnboardingForm, OnboardingStep } from '@/features/onboarding/onboarding.types';
import type { OnboardingBootstrap } from '@/features/onboarding/services/onboarding.service';
import {
  completeOnboardingOnServer,
  fetchOnboardingBootstrap,
  saveOnboardingBranding,
  saveOnboardingProject,
} from '@/features/onboarding/services/onboarding.service';
import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { useTranslation } from '@/i18n';

export function useOnboardingFlow() {
  const { t } = useTranslation();
  const { isReady } = useAuthenticatedBootstrap();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [bootstrapData, setBootstrapData] = useState<OnboardingBootstrap | null>(null);

  const canStepProceed = useCallback(
    (data: OnboardingForm) => {
      if (step === 1) return brandingSchema.safeParse(data.branding).success;
      return projectSchema.safeParse(data.project).success;
    },
    [step],
  );

  const bootstrap = useCallback(async () => {
    if (!isReady) return null;
    setIsBootstrapping(true);
    setStepError(null);
    try {
      const payload = await fetchOnboardingBootstrap();
      setBootstrapData(payload);
      setStep(payload.step > 2 ? 2 : payload.step);
      setProjectId(payload.projectId);
      return payload;
    } catch (error) {
      setStepError(error instanceof Error ? error.message : t('onboarding.loading.status'));
      return null;
    } finally {
      setIsBootstrapping(false);
    }
  }, [isReady, t]);

  useEffect(() => {
    if (!isReady) {
      setIsBootstrapping(true);
      return;
    }
    void bootstrap();
  }, [bootstrap, isReady]);

  const goNext = useCallback(
    async (data: OnboardingForm, validateCurrentStep?: () => Promise<boolean>) => {
      const isValid = validateCurrentStep ? await validateCurrentStep() : canStepProceed(data);
      if (!isValid || !canStepProceed(data)) {
        setStepError(t('errors.server.description'));
        return false;
      }

      setIsSavingStep(true);
      setStepError(null);

      try {
        if (step === 1) {
          await saveOnboardingBranding(data);
          setStep(2);
        }
        return true;
      } catch (error) {
        setStepError(error instanceof Error ? error.message : t('errors.server.description'));
        return false;
      } finally {
        setIsSavingStep(false);
      }
    },
    [canStepProceed, step, t],
  );

  const goBack = useCallback(() => {
    setStepError(null);
    setStep((prev) => (prev > 1 ? 1 : prev));
  }, []);

  const finishOnboarding = useCallback(async (data: OnboardingForm) => {
    setIsSavingStep(true);
    setStepError(null);
    try {
      if (
        !brandingSchema.safeParse(data.branding).success ||
        !projectSchema.safeParse(data.project).success
      ) {
        setStepError(t('errors.server.description'));
        return false;
      }

      await saveOnboardingBranding(data);

      const savedProjectId = await saveOnboardingProject(data);
      if (savedProjectId) {
        setProjectId(savedProjectId);
      }

      await completeOnboardingOnServer();
      return true;
    } catch (error) {
      setStepError(error instanceof Error ? error.message : t('errors.server.description'));
      return false;
    } finally {
      setIsSavingStep(false);
    }
  }, [t]);

  return {
    step,
    projectId,
    canStepProceed,
    goNext,
    goBack,
    finishOnboarding,
    bootstrap,
    bootstrapData,
    isSavingStep,
    isBootstrapping,
    stepError,
    setStepError,
  };
}
