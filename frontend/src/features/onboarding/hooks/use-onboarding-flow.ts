import { useCallback, useEffect, useMemo, useState } from 'react';

import { createOnboardingSchemas } from '@/features/onboarding/onboarding.schema';
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
import { useToast } from '@/shared/toast/use-toast';

export function useOnboardingFlow() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isReady } = useAuthenticatedBootstrap();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [bootstrapData, setBootstrapData] = useState<OnboardingBootstrap | null>(null);
  const { brandingSchema, projectSchema } = useMemo(() => createOnboardingSchemas(t), [t]);

  const reportServerError = useCallback(
    (error: unknown, fallbackKey: string) => {
      const message = error instanceof Error ? error.message : t(fallbackKey);
      toast({ description: message, variant: 'error' });
    },
    [t, toast],
  );

  const canStepProceed = useCallback(
    (data: OnboardingForm) => {
      if (step === 1) return brandingSchema.safeParse(data.branding).success;
      return projectSchema.safeParse(data.project).success;
    },
    [brandingSchema, projectSchema, step],
  );

  const bootstrap = useCallback(async () => {
    if (!isReady) return null;
    setIsBootstrapping(true);
    try {
      const payload = await fetchOnboardingBootstrap();
      setBootstrapData(payload);
      setStep(payload.step > 2 ? 2 : payload.step);
      setProjectId(payload.projectId);
      return payload;
    } catch (error) {
      reportServerError(error, 'onboarding.loading.status');
      return null;
    } finally {
      setIsBootstrapping(false);
    }
  }, [isReady, reportServerError]);

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
        return false;
      }

      setIsSavingStep(true);

      try {
        if (step === 1) {
          await saveOnboardingBranding(data);
          setStep(2);
        }
        return true;
      } catch (error) {
        reportServerError(error, 'errors.server.description');
        return false;
      } finally {
        setIsSavingStep(false);
      }
    },
    [canStepProceed, reportServerError, step],
  );

  const goBack = useCallback(() => {
    setStep((prev) => (prev > 1 ? 1 : prev));
  }, []);

  const finishOnboarding = useCallback(
    async (data: OnboardingForm) => {
      setIsSavingStep(true);
      try {
        if (
          !brandingSchema.safeParse(data.branding).success ||
          !projectSchema.safeParse(data.project).success
        ) {
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
        reportServerError(error, 'errors.server.description');
        return false;
      } finally {
        setIsSavingStep(false);
      }
    },
    [brandingSchema, projectSchema, reportServerError],
  );

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
  };
}
