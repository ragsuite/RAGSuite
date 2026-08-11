import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft } from 'lucide-react-native';
import React, { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { AppKeyboardAvoiding } from '@/shared/components/app-keyboard-avoiding';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth/providers/session-provider';
import { LivePreviewPanel } from '@/features/onboarding/components/live-preview-panel';
import { OnboardingStepper } from '@/features/onboarding/components/onboarding-stepper';
import { useOnboardingFlow } from '@/features/onboarding/hooks/use-onboarding-flow';
import {
  getOnboardingCopy,
  ONBOARDING_DRAFT_KEY,
  ONBOARDING_PRIMARY_DEFAULT,
  ONBOARDING_THEME_PRESETS,
} from '@/features/onboarding/onboarding.constants';
import { onboardingSchema } from '@/features/onboarding/onboarding.schema';
import type { OnboardingForm, OnboardingStep } from '@/features/onboarding/onboarding.types';
import {
  isOnboardingPhoneLayout,
  ONBOARDING_DESKTOP_PADDING,
  ONBOARDING_MOBILE_BREAKPOINT,
  ONBOARDING_MOBILE_FORM_GAP,
  ONBOARDING_MOBILE_PADDING,
  ONBOARDING_MOBILE_SCROLL_BOTTOM,
  ONBOARDING_MOBILE_SECTION_GAP,
} from '@/features/onboarding/utils/onboarding-layout';
import { storage } from '@/services/storage/storage';
import { AppButton } from '@/shared/components/app-button';
import {
  AppColorFieldInput,
  AppColorFieldPickerTrigger,
  AppColorFieldRoot,
} from '@/shared/components/app-color-field';
import { FormCard } from '@/shared/components/form-card';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableViewportWidth } from '@/shared/hooks/use-stable-viewport-width';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { pageEntering } from '@/shared/utils/motion-entering';
import { getInputTextStyle } from '@/shared/utils/input-text-style';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';
import { ActionIcons } from '@/shared/constants/action-icons';

export function OnboardingScreen() {
  const { t } = useTranslation();
  const copy = useMemo(() => getOnboardingCopy(t), [t]);
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const stepEntering = pageEntering(reducedMotion);
  const width = useStableViewportWidth();
  const insets = useSafeAreaInsets();
  const isMobile = width < ONBOARDING_MOBILE_BREAKPOINT;
  const isPhoneLayout = isOnboardingPhoneLayout(width);
  const pagePadding = isPhoneLayout ? ONBOARDING_MOBILE_PADDING : ONBOARDING_DESKTOP_PADDING;
  const singleLineInputStyle = getInputTextStyle(typography.body, { height: 48, includeHorizontalPadding: false });
  const { completeOnboarding } = useSession();
  const {
    step,
    canStepProceed,
    goBack,
    goNext,
    finishOnboarding,
    bootstrapData,
    isSavingStep,
    isBootstrapping,
    stepError,
  } = useOnboardingFlow();
  const {
    control,
    setValue,
    getValues,
    reset,
    trigger,
    formState: { errors },
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: {
      branding: {
        organizationName: '',
        primaryColor: ONBOARDING_PRIMARY_DEFAULT,
        themePreset: ONBOARDING_PRIMARY_DEFAULT,
      },
      project: { projectName: '', projectDescription: '' },
      dataSource: {
        websiteUrl: '',
        crawlDepth: '1',
        crawlFrequency: 'once',
        headless: false,
        crawlStatus: 'idle',
      },
      quickTest: { question: '' },
    },
  });
  const watchedData = useWatch({ control });
  const data = useMemo(
    () => mergeOnboardingFormValues(getValues(), watchedData as Partial<OnboardingForm> | undefined),
    [watchedData, getValues],
  );

  useEffect(() => {
    void (async () => {
      const draft = await storage.getItem(ONBOARDING_DRAFT_KEY);
      if (draft) {
        try {
          reset(JSON.parse(draft) as OnboardingForm);
        } catch {
          // Ignore malformed draft and continue.
        }
      }
    })();
  }, [reset]);

  useEffect(() => {
    if (!bootstrapData) return;

    if (bootstrapData.status.needs_onboarding === false) {
      void completeOnboarding().then(() => {
        router.replace('/(app)/(tabs)');
      });
      return;
    }

    reset((current) => ({
      ...current,
      branding: {
        ...current.branding,
        ...bootstrapData.branding,
        organizationName: bootstrapData.branding.organizationName ?? current.branding.organizationName,
        primaryColor: bootstrapData.branding.primaryColor ?? current.branding.primaryColor,
        themePreset: bootstrapData.branding.themePreset ?? current.branding.themePreset,
        logoUri: bootstrapData.branding.logoUri ?? current.branding.logoUri,
      },
      dataSource: {
        ...current.dataSource,
        websiteUrl: bootstrapData.dataSource.websiteUrl ?? current.dataSource.websiteUrl,
        crawlDepth: bootstrapData.dataSource.crawlDepth ?? current.dataSource.crawlDepth,
        crawlFrequency: bootstrapData.dataSource.crawlFrequency ?? current.dataSource.crawlFrequency,
        headless: bootstrapData.dataSource.headless ?? current.dataSource.headless,
        crawlStatus: bootstrapData.dataSource.crawlStatus ?? current.dataSource.crawlStatus,
        crawlMessage: bootstrapData.dataSource.crawlMessage ?? current.dataSource.crawlMessage,
      },
    }));
  }, [bootstrapData, completeOnboarding, reset]);

  useEffect(() => {
    void storage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(data));
  }, [data]);

  const finish = async () => {
    const isValid = await validateCurrentStep();
    if (!isValid || !canStepProceed(data)) {
      return;
    }

    const ok = await finishOnboarding(getValues());
    if (!ok) return;

    await completeOnboarding();
    await storage.removeItem(ONBOARDING_DRAFT_KEY);
    router.replace('/(app)/(tabs)');
  };

  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setValue('branding.logoUri', result.assets[0].uri);
    }
  };

  const validateCurrentStep = async () => {
    const fieldsByStep: Record<number, FieldPath<OnboardingForm>[]> = {
      1: ['branding.organizationName', 'branding.primaryColor', 'branding.themePreset'],
      2: ['project.projectName', 'project.projectDescription'],
    };

    return trigger(fieldsByStep[step], { shouldFocus: true });
  };

  const nextButtonLabel =
    step === 2 && isSavingStep
      ? t('onboarding.dataSource.actions.creating')
      : step === 1
        ? `${t('common.next')} →`
        : t('onboarding.actions.finish');

  const formPanel = (
    <View style={[styles.col, isPhoneLayout ? styles.colPhone : null]}>
      <FormCard>
        {!isPhoneLayout ? (
          <Text style={[typography.subtitle, { color: colors.text, marginBottom: 12 }]}>
            {t('onboarding.step.label', {
              step,
              title:
                step === 1
                  ? t('onboarding.steps.branding.title')
                  : t('onboarding.steps.project.title'),
            })}
          </Text>
        ) : null}

        {step === 1 ? (
          <Animated.View key="onboarding-step-1" entering={stepEntering}>
          <View style={[styles.formGap, isPhoneLayout && styles.formGapPhone]}>
            <FieldBlock
              label={copy.branding.orgNameLabel}
              error={errors.branding?.organizationName?.message}>
              <Controller
                control={control}
                name="branding.organizationName"
                render={({ field: { value, onChange } }) => (
                  <TextInput
                    placeholder={copy.branding.orgNamePlaceholder}
                    value={value}
                    onChangeText={onChange}
                    style={[singleLineInputStyle, styles.input, { borderColor: colors.border, color: colors.text, borderRadius: surfaceRadius.input }]}
                  />
                )}
              />
            </FieldBlock>

            <FieldBlock label={copy.branding.logoLabel}>
              <View style={styles.row}>
                <Pressable
                  style={[styles.logoPlaceholderBtn, { borderColor: colors.border, borderRadius: surfaceRadius.button }]}
                  onPress={() => void pickLogo()}>
                  {data.branding.logoUri ? (
                    <Image source={{ uri: data.branding.logoUri }} style={styles.logoThumb} contentFit="cover" />
                  ) : (
                    <ActionIcons.upload size={16} color={colors.textMuted} />
                  )}
                </Pressable>
                <Pressable
                  style={[styles.uploadBtn, { borderColor: colors.border, borderRadius: surfaceRadius.button }]}
                  onPress={() => void pickLogo()}>
                  <ActionIcons.upload size={14} color={colors.textMuted} />
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {data.branding.logoUri ? t('onboarding.branding.logo.change') : t('onboarding.branding.logo.upload')}
                  </Text>
                </Pressable>
              </View>
            </FieldBlock>

            <Controller
              control={control}
              name="branding.primaryColor"
              render={({ field: { value, onChange } }) => (
                <AppColorFieldRoot
                  label={copy.branding.primaryColorLabel}
                  value={value}
                  onChange={(next) => {
                    onChange(next);
                    setValue('branding.themePreset', next);
                  }}>
                  <AppColorFieldInput />
                  <FieldBlock label={copy.branding.themePresetsLabel}>
                    <View style={styles.presetRow}>
                      {ONBOARDING_THEME_PRESETS.map((preset) => (
                        <Pressable
                          key={preset}
                          accessibilityRole="button"
                          accessibilityLabel={`Theme preset ${preset}`}
                          onPress={() => {
                            setValue('branding.primaryColor', preset);
                            setValue('branding.themePreset', preset);
                          }}
                          style={[
                            styles.preset,
                            isMobile ? styles.presetMobile : null,
                            {
                              backgroundColor: preset,
                              borderRadius: surfaceRadius.button,
                              borderColor: data.branding.themePreset === preset ? colors.text : 'transparent',
                            },
                          ]}
                        />
                      ))}
                      <AppColorFieldPickerTrigger
                        size={isMobile ? 44 : { width: 48, height: 28 }}
                      />
                    </View>
                  </FieldBlock>
                </AppColorFieldRoot>
              )}
            />
            {errors.branding?.primaryColor?.message ? (
              <InlineError label={errors.branding.primaryColor.message} />
            ) : null}
          </View>
          </Animated.View>
        ) : null}

        {step === 2 ? (
          <Animated.View key="onboarding-step-2" entering={stepEntering}>
          <View style={[styles.formGap, isPhoneLayout && styles.formGapPhone]}>
            <FieldBlock
              label={copy.project.nameLabel}
              helper={copy.project.nameHelper}
              error={errors.project?.projectName?.message}>
              <Controller
                control={control}
                name="project.projectName"
                render={({ field: { value, onChange } }) => (
                  <TextInput
                    placeholder={copy.project.namePlaceholder}
                    value={value}
                    onChangeText={onChange}
                    style={[singleLineInputStyle, styles.input, { borderColor: colors.border, color: colors.text, borderRadius: surfaceRadius.input }]}
                  />
                )}
              />
            </FieldBlock>

            <FieldBlock
              label={copy.project.descriptionLabel}
              helper={copy.project.descriptionHelper}
              error={errors.project?.projectDescription?.message}>
              <Controller
                control={control}
                name="project.projectDescription"
                render={({ field: { value, onChange } }) => (
                  <TextInput
                    placeholder={copy.project.descriptionPlaceholder}
                    value={value}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    onChangeText={onChange}
                    style={[
                      styles.textarea,
                      isPhoneLayout ? styles.textareaPhone : null,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        borderRadius: surfaceRadius.input,
                        fontSize: typography.body.fontSize,
                        lineHeight: typography.body.lineHeight,
                      },
                      Platform.OS === 'web' ? styles.textareaWeb : null,
                    ]}
                  />
                )}
              />
              <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'right' }]}>
                {t('onboarding.project.description.counter', {
                  count: data.project.projectDescription.length,
                  max: 500,
                })}
              </Text>
            </FieldBlock>
          </View>
          </Animated.View>
        ) : null}

        {stepError ? <InlineError label={stepError} /> : null}

        <OnboardingNavActions
          step={step}
          isPhoneLayout={isPhoneLayout}
          nextButtonLabel={nextButtonLabel}
          isSavingStep={isSavingStep}
          canProceed={canStepProceed(data)}
          onBack={goBack}
          onNext={() => void goNext(data, validateCurrentStep)}
          onFinish={() => void finish()}
        />
      </FormCard>
    </View>
  );

  const previewPanel = (
    <View style={[styles.col, isPhoneLayout ? styles.colPhone : null]}>
      <LivePreviewPanel step={step} data={data} compact={isPhoneLayout} />
    </View>
  );

  const stepPanels = [formPanel, previewPanel];

  return (
    <AppKeyboardAvoiding
      style={[{ flex: 1 }, { backgroundColor: colors.background }]}
      surface="screen"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 12 : 0}>
      <AppScrollView
        automaticallyAdjustKeyboardInsets={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + ONBOARDING_MOBILE_SCROLL_BOTTOM + (isPhoneLayout ? 32 : 12),
          },
        ]}>
        <View
          style={{
              maxWidth: 1120,
              alignSelf: 'center',
              width: '100%',
              paddingHorizontal: pagePadding,
              paddingBottom: pagePadding,
              paddingTop: pagePadding + (isPhoneLayout ? insets.top : 0),
              gap: isPhoneLayout ? ONBOARDING_MOBILE_SECTION_GAP : 20,
            }}>
          <View style={[styles.header, isPhoneLayout ? styles.headerPhone : null]}>
            {!isPhoneLayout ? (
              <>
                <View style={styles.brandRow}>
                  <View style={[styles.iconWrap, { borderRadius: surfaceRadius.button, backgroundColor: colors.surface }]}>
                    <Image source={require('@/assets/app-brand-icon.png')} style={styles.brandIcon} />
                  </View>
                  <Text style={[typography.title, { color: colors.text }]}>RAGSuite</Text>
                </View>
                <Text style={[typography.hero, { color: colors.text, textAlign: 'center' }]}>
                  {t('onboarding.header.title', { brand: 'RAGSuite' })}
                </Text>
                <Text
                  style={[
                    typography.body,
                    {
                      color: colors.textMuted,
                      textAlign: 'center',
                      lineHeight: 22,
                      paddingHorizontal: 24,
                    },
                  ]}>
                  {t('onboarding.header.subtitle')}
                </Text>
              </>
            ) : (
              <View style={{ gap: spacing.xs, alignItems: 'center', width: '100%' }}>
                <View style={styles.brandRow}>
                  <View style={[styles.iconWrap, { borderRadius: surfaceRadius.button, backgroundColor: colors.surface }]}>
                    <Image source={require('@/assets/app-brand-icon.png')} style={styles.brandIcon} />
                  </View>
                  <Text style={[typography.subtitle, { color: colors.text }]}>RAGSuite</Text>
                </View>
                <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 }]}>
                  {t('onboarding.header.subtitle')}
                </Text>
              </View>
            )}
          </View>

          <OnboardingStepper step={step} compact={isPhoneLayout} />

          <StatePanel loading={isBootstrapping} error={null}>
            <View
              style={[
                styles.grid,
                { gap: spacing.md, flexDirection: isPhoneLayout ? 'column' : 'row' },
              ]}>
              {stepPanels.map((panel, index) => (
                <React.Fragment key={index}>{panel}</React.Fragment>
              ))}
            </View>
          </StatePanel>
        </View>
      </AppScrollView>
    </AppKeyboardAvoiding>
  );
}

/** useWatch can return partial nested objects — merge with full form values for validation/UI. */
function mergeOnboardingFormValues(
  base: OnboardingForm,
  patch?: Partial<OnboardingForm>,
): OnboardingForm {
  if (!patch) return base;
  return {
    branding: { ...base.branding, ...patch.branding },
    project: { ...base.project, ...patch.project },
    dataSource: { ...base.dataSource, ...patch.dataSource },
    quickTest: { ...base.quickTest, ...patch.quickTest },
  };
}

function OnboardingNavActions({
  step,
  isPhoneLayout,
  nextButtonLabel,
  isSavingStep,
  canProceed,
  onBack,
  onNext,
  onFinish,
}: {
  step: OnboardingStep;
  isPhoneLayout: boolean;
  nextButtonLabel: string;
  isSavingStep: boolean;
  canProceed: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const { colors, typography, surfaceRadius } = useAppTheme();
  const nextDisabled = isSavingStep || (step === 2 && !canProceed);
  const nextLoading = isSavingStep;

  if (isPhoneLayout) {
    if (step === 1) {
      return (
        <View style={[styles.navShellPhone, { borderTopColor: colors.border }]}>
          <View style={styles.navRowPhoneSingle}>
            <AppButton label={nextButtonLabel} onPress={onNext} disabled={nextDisabled} loading={nextLoading} fullWidth size="compact" noTopMargin />
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.navShellPhone, { borderTopColor: colors.border }]}>
        <View style={styles.navRowPhone}>
          <View style={styles.navSlotPhone}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              style={({ pressed, focused }) => [
                styles.navBtnOutline,
                {
                  borderColor: colors.border,
                  borderRadius: surfaceRadius.button,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  opacity: pressed ? 0.92 : 1,
                },
                focusRingStyle(focused, colors.primary),
              ]}>
              <ArrowLeft size={16} color={colors.textMuted} />
              <Text style={[typography.body, { color: colors.textMuted, fontWeight: '500', flexShrink: 1 }]} numberOfLines={2}>
                {t('common.back')}
              </Text>
            </Pressable>
          </View>
          <View style={styles.navSlotPhone}>
            {step < 2 ? (
              <AppButton
                label={nextButtonLabel}
                onPress={onNext}
                disabled={nextDisabled}
                loading={nextLoading}
                fullWidth
                size="compact"
                noTopMargin
              />
            ) : (
              <AppButton
                label={t('onboarding.actions.finish')}
                onPress={onFinish}
                disabled={nextDisabled}
                loading={nextLoading}
                fullWidth
                size="compact"
                noTopMargin
              />
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.actions, step === 1 ? styles.actionsStepOne : null]}>
      {step > 1 ? (
        <Pressable
          onPress={onBack}
          style={[styles.backBtn, { borderColor: colors.border, borderRadius: surfaceRadius.button }]}>
          <ArrowLeft size={16} color={colors.textMuted} />
          <Text style={[typography.body, { color: colors.textMuted }]}>{t('common.back')}</Text>
        </Pressable>
      ) : null}

      {step < 2 ? (
        <AppButton
          label={nextButtonLabel}
          onPress={onNext}
          disabled={nextDisabled}
          loading={nextLoading}
          size="compact"
          noTopMargin
        />
      ) : (
        <AppButton label={t('onboarding.actions.finish')} onPress={onFinish} disabled={nextDisabled} loading={nextLoading} size="compact" noTopMargin />
      )}
    </View>
  );
}

function FieldBlock({
  label,
  helper,
  error,
  children,
}: {
  label: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const { colors, typography } = useAppTheme();
  return (
    <View style={styles.fieldBlock}>
      <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{label}</Text>
      {children}
      {helper ? (
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 16 }]}>{helper}</Text>
      ) : null}
      {error ? <InlineError label={error} /> : null}
    </View>
  );
}

function InlineError({ label }: { label: string }) {
  const { colors, typography } = useAppTheme();
  return <Text style={[typography.caption, { color: colors.danger }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  header: { alignItems: 'center', gap: 8 },
  headerPhone: { gap: 4, marginBottom: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  brandIcon: { width: 18, height: 18 },
  grid: { flexWrap: 'wrap' },
  col: { flex: 1, minWidth: 280 },
  colPhone: { flex: 0, minWidth: 0, width: '100%' },
  formGap: { gap: 16 },
  formGapPhone: { gap: ONBOARDING_MOBILE_FORM_GAP },
  fieldBlock: { gap: 8 },
  input: { borderWidth: 1, height: 48, paddingHorizontal: 14 },
  textarea: {
    borderWidth: 1,
    minHeight: 112,
    width: '100%',
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    textAlignVertical: 'top',
  },
  textareaPhone: { minHeight: 128 },
  textareaWeb: {
    outlineStyle: 'none',
    verticalAlign: 'top',
    resize: 'vertical',
  } as const,
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urlStack: { gap: 10 },
  urlInputMobile: { width: '100%' },
  logoPlaceholderBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoThumb: { width: 44, height: 44 },
  uploadBtn: {
    height: 44,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  preset: { width: 48, height: 28, borderWidth: 2 },
  presetMobile: { width: 44, height: 44 },
  urlInput: { flex: 1 },
  alertBox: { borderWidth: 1, padding: 12, gap: 6 },
  alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headlessRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headlessRowPhone: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  questionWrap: {
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  questionWrapPhone: {
    minHeight: 52,
    paddingVertical: 4,
  },
  questionInput: { flex: 1, minHeight: 40 },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerBox: { borderWidth: 1, padding: 12 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  actionsStepOne: { justifyContent: 'flex-end' },
  navShellPhone: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navRowPhone: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  navRowPhoneSingle: {
    width: '100%',
  },
  navSlotPhone: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  navBtnOutline: {
    borderWidth: 1,
    height: 48,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  backBtn: {
    borderWidth: 1,
    height: 48,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 6,
  },
  headlessCopy: { flex: 1, gap: 2 },
});

