import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { motionDuration, useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { getFieldPlaceholderColor } from '@/shared/utils/field-placeholder-styles';
import { webFocusBorderStyle, webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
import { getInputTextStyle, INPUT_FIELD_HEIGHT } from '@/shared/utils/input-text-style';
import { genericFieldAutofillProps } from '@/shared/utils/search-input-autofill';

type Props = TextInputProps & {
  label: string;
  error?: string;
  rightAdornment?: React.ReactNode;
  /** Centered mono input for OTP / verification codes (reference parity). */
  variant?: 'default' | 'otp';
};

const otpBaseStyle = {
  textAlign: 'center' as const,
  fontSize: 24,
  letterSpacing: 8,
};

export const AppTextField = React.forwardRef<TextInput, Props>(function AppTextField(
  {
    label,
    error,
    rightAdornment,
    style,
    variant = 'default',
    editable = true,
    multiline,
    /** Default off so web password managers do not fill usernames into generic fields. Auth screens pass username/password/email explicitly. */
    autoComplete = 'off',
    ...inputProps
  },
  ref,
) {
  const { colors, spacing, surfaceRadius, typography, motion, fonts } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const [isFocused, setIsFocused] = useState(false);
  const border = useSharedValue(error ? 2 : isFocused ? 1 : 0);
  const placeholderColor = getFieldPlaceholderColor(colors);

  useEffect(() => {
    border.value = withTiming(error ? 2 : isFocused ? 1 : 0, {
      duration: motionDuration(reducedMotion, motion.quick),
    });
  }, [border, error, isFocused, motion.quick, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const borderColor = border.value === 2 ? colors.danger : border.value === 1 ? colors.primary : colors.borderStrong;
    return { borderColor };
  });

  const fieldBackground = !editable ? colors.surfaceMuted : colors.surface;
  const isMultiline = multiline === true;
  const singleLineField = !isMultiline;
  const flattenedInputStyle = StyleSheet.flatten(style);
  const resolvedFontSize =
    (typeof flattenedInputStyle?.fontSize === 'number' ? flattenedInputStyle.fontSize : undefined) ??
    typography.fieldInput.fontSize;

  const innerFieldHeight = INPUT_FIELD_HEIGHT - 2;
  const { numberOfLines: multilineNumberOfLines, scrollEnabled: _scrollEnabledProp, ...restInputProps } =
    inputProps;

  return (
    <View style={[styles.stack, { gap: spacing.xxs }]}>
      {label ? (
        <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>
      ) : null}
      <Animated.View
        style={[
          styles.inputWrap,
          isMultiline ? styles.inputWrapMultiline : null,
          animatedStyle,
          Platform.OS === 'web' ? webFocusBorderStyle(isFocused, colors.primary, colors.borderStrong) : null,
          {
            borderRadius: surfaceRadius.input,
            backgroundColor: fieldBackground,
            opacity: editable ? 1 : 0.72,
            ...(singleLineField
              ? { height: INPUT_FIELD_HEIGHT, overflow: 'hidden' as const }
              : { minHeight: INPUT_FIELD_HEIGHT }),
          },
        ]}
        pointerEvents="box-none">
        <TextInput
          ref={ref}
          {...(autoComplete === 'off' ? genericFieldAutofillProps : null)}
          {...restInputProps}
          autoComplete={autoComplete}
          editable={editable}
          multiline={isMultiline}
          numberOfLines={isMultiline ? multilineNumberOfLines : undefined}
          scrollEnabled={isMultiline}
          onFocus={(event) => {
            setIsFocused(true);
            restInputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            restInputProps.onBlur?.(event);
          }}
          style={[
            isMultiline ? styles.input : styles.singleLineInput,
            getInputTextStyle(
              {
                fontSize: resolvedFontSize,
                fontWeight: typography.fieldInput.fontWeight,
                lineHeight: typography.fieldInput.lineHeight,
                fontFamily: typography.fieldInput.fontFamily,
              },
              {
                multiline: isMultiline,
                textAlign: variant === 'otp' ? 'center' : undefined,
                height: isMultiline ? undefined : innerFieldHeight,
                fillContainer: singleLineField,
                maxHeight: singleLineField ? innerFieldHeight : undefined,
              },
            ),
            { color: colors.text },
            isMultiline ? styles.multilineInput : null,
            variant === 'otp' ? { ...otpBaseStyle, fontFamily: fonts.mono } : null,
            webSuppressInputOutline(),
            style,
          ]}
          placeholderTextColor={placeholderColor}
        />
        {rightAdornment ? <View style={[styles.adornment, isMultiline ? styles.adornmentMultiline : null]}>{rightAdornment}</View> : null}
      </Animated.View>
      {error ? <Text style={[typography.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
});


const styles = StyleSheet.create({
  stack: {
    width: '100%',
  },
  inputWrap: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWrapMultiline: {
    alignItems: 'flex-start',
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  singleLineInput: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  multilineInput: {
    minHeight: 100,
  },
  adornment: {
    flexShrink: 0,
    paddingRight: 12,
  },
  adornmentMultiline: {
    paddingTop: 12,
  },
});

