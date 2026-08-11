import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutRectangle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { AppButton } from '@/shared/components/app-button';
import { platformShadow } from '@/shared/utils/platform-shadow';
import { useTranslation } from '@/i18n';
import {
  clamp,
  COLOR_SPECTRUM_GRADIENT,
  hexToHsv,
  hsvToHexString,
  hsvToRgb,
  isValidHex,
  normalizeHex,
  rgbToHsv,
  type HSV,
} from '@/shared/utils/color-picker';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

const PRESET_COLORS = [
  '#FBFAF6',
  '#1B1A17',
  '#1E3A30',
  '#2E6A4E',
  '#B6802E',
  '#A23B2E',
  '#16271F',
  '#57544C',
  '#EDE8DC',
  '#E7EDE7',
  '#F4F1EA',
  '#6E6A5C',
];

type Props = {
  visible: boolean;
  title?: string;
  value: string;
  onClose: () => void;
  onApply: (hex: string) => void;
};

function SaturationValuePanel({
  hue,
  saturation,
  brightness,
  onChange,
  onInteractionChange,
}: {
  hue: number;
  saturation: number;
  brightness: number;
  onChange: (next: Pick<HSV, 's' | 'v'>) => void;
  onInteractionChange: (active: boolean) => void;
}) {
  const { colors, surfaceRadius, radius } = useAppTheme();
  const { t } = useTranslation();
  const layoutRef = useRef<LayoutRectangle>({ x: 0, y: 0, width: 1, height: 1 });
  const [layout, setLayout] = useState<LayoutRectangle>({ x: 0, y: 0, width: 1, height: 1 });

  const pureHue = hsvToHexString({ h: hue, s: 1, v: 1 });

  const updateFromTouch = useCallback(
    (locationX: number, locationY: number) => {
      const { width, height } = layoutRef.current;
      if (width <= 0 || height <= 0) return;
      onChange({
        s: clamp(locationX / width, 0, 1),
        v: clamp(1 - locationY / height, 0, 1),
      });
    },
    [onChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
          onInteractionChange(true);
          updateFromTouch(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderMove: (event) =>
          updateFromTouch(event.nativeEvent.locationX, event.nativeEvent.locationY),
        onPanResponderRelease: () => onInteractionChange(false),
        onPanResponderTerminate: () => onInteractionChange(false),
      }),
    [onInteractionChange, updateFromTouch],
  );

  const thumbLeft = clamp(saturation * layout.width - 12, 0, Math.max(0, layout.width - 24));
  const thumbTop = clamp((1 - brightness) * layout.height - 12, 0, Math.max(0, layout.height - 24));

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={(event) => {
        layoutRef.current = event.nativeEvent.layout;
        setLayout(event.nativeEvent.layout);
      }}
      style={[
        styles.svPanel,
        { borderColor: colors.border, borderRadius: surfaceRadius.card, backgroundColor: pureHue },
      ]}
      accessibilityRole="adjustable"
      accessibilityLabel={t('common.color.saturationBrightness')}>
      <LinearGradient
        colors={['#ffffff', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, styles.nonInteractiveLayer]}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.nonInteractiveLayer]}
      />
      <View
        style={[
          styles.svThumb,
          styles.nonInteractiveLayer,
          {
            left: thumbLeft,
            top: thumbTop,
            borderColor: '#ffffff',
            borderRadius: radius.pill,
            backgroundColor: hsvToHexString({ h: hue, s: saturation, v: brightness }),
          },
        ]}
      />
    </View>
  );
}

function HueSlider({
  hue,
  onChange,
  onInteractionChange,
}: {
  hue: number;
  onChange: (hue: number) => void;
  onInteractionChange: (active: boolean) => void;
}) {
  const { colors, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={styles.hueWrap}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={() => onInteractionChange(true)}
      onResponderRelease={() => onInteractionChange(false)}
      onResponderTerminate={() => onInteractionChange(false)}>
      <LinearGradient
        colors={[...COLOR_SPECTRUM_GRADIENT]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.hueTrack, styles.nonInteractiveLayer, { borderRadius: surfaceRadius.input, borderColor: colors.border }]}
      />
      <Slider
        accessibilityLabel={t('common.color.hue')}
        accessibilityRole="adjustable"
        value={hue}
        minimumValue={0}
        maximumValue={360}
        step={1}
        onSlidingStart={() => onInteractionChange(true)}
        onSlidingComplete={() => onInteractionChange(false)}
        onValueChange={onChange}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor="#ffffff"
        style={styles.hueSlider}
      />
    </View>
  );
}

function ChannelInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const { colors, surfaceRadius, typography } = useAppTheme();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    onChange(clamp(parsed, 0, 255));
  };

  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={[typography.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={draft}
        keyboardType="number-pad"
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        style={[
          getInputTextStyle(typography.body, { textAlign: 'center', includeHorizontalPadding: false }),
          styles.channelInput,
          {
            color: colors.text,
            borderColor: colors.border,
            borderRadius: surfaceRadius.input,
            backgroundColor: colors.surfaceMuted,
          },
        ]}
      />
    </View>
  );
}

export function AppNativeColorPickerSheet({ visible, title, value, onClose, onApply }: Props) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const { t } = useTranslation();
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(normalizeHex(value)));
  const [hexDraft, setHexDraft] = useState(normalizeHex(value));
  const [interactionLocked, setInteractionLocked] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const next = hexToHsv(normalizeHex(value));
    setHsv(next);
    setHexDraft(normalizeHex(value));
    setInteractionLocked(false);
  }, [visible, value]);

  const previewHex = hsvToHexString(hsv);
  const rgb = hsvToRgb(hsv);

  const applyHsv = useCallback((next: HSV) => {
    const clamped = {
      h: clamp(next.h, 0, 360),
      s: clamp(next.s, 0, 1),
      v: clamp(next.v, 0, 1),
    };
    setHsv(clamped);
    setHexDraft(hsvToHexString(clamped));
  }, []);

  const applyHexDraft = (text: string) => {
    setHexDraft(text);
    if (!isValidHex(text)) return;
    applyHsv(hexToHsv(normalizeHex(text)));
  };

  const applyRgb = (channel: 'r' | 'g' | 'b', channelValue: number) => {
    const nextRgb = { ...rgb, [channel]: clamp(channelValue, 0, 255) };
    applyHsv(rgbToHsv(nextRgb));
  };

  const handleSvChange = useCallback(
    (next: Pick<HSV, 's' | 'v'>) => {
      setHsv((current) => {
        const merged = { ...current, ...next };
        setHexDraft(hsvToHexString(merged));
        return merged;
      });
    },
    [],
  );

  return (
    <AdaptiveOverlay
      visible={visible}
      title={title ?? t('common.color.pick')}
      subtitle={t('common.color.pickerSubtitle')}
      onClose={onClose}
      scrollable
      scrollEnabled={!interactionLocked}
      footerBordered
      contentStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
      footer={
        <View style={{ gap: spacing.xs }}>
          <AppButton label={t('common.color.apply')} size="compact" variant="cta" onPress={() => onApply(previewHex)} />
          <AppButton label={t('common.cancel')} size="compact" variant="outline" onPress={onClose} />
        </View>
      }>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={{ gap: spacing.md }}>
          <View
            style={[
              styles.previewBar,
              {
                backgroundColor: previewHex,
                borderColor: colors.border,
                borderRadius: surfaceRadius.card,
              },
            ]}
            accessibilityLabel={t('common.color.selected', { color: previewHex })}
          />

          <SaturationValuePanel
            hue={hsv.h}
            saturation={hsv.s}
            brightness={hsv.v}
            onChange={handleSvChange}
            onInteractionChange={setInteractionLocked}
          />

          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.fieldLabel, { color: colors.textMuted }]}>{t('common.color.hue')}</Text>
            <HueSlider
              hue={hsv.h}
              onChange={(h) => applyHsv({ ...hsv, h })}
              onInteractionChange={setInteractionLocked}
            />
          </View>

          <View style={{ gap: spacing.xxs }}>
            <Text style={[typography.fieldLabel, { color: colors.textMuted }]}>{t('common.color.hex')}</Text>
            <TextInput
              accessibilityLabel={t('common.color.hexValue')}
              value={hexDraft}
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={applyHexDraft}
              onBlur={() => {
                if (isValidHex(hexDraft)) {
                  setHexDraft(normalizeHex(hexDraft));
                } else {
                  setHexDraft(previewHex);
                }
              }}
              style={[
                getInputTextStyle(typography.body, { includeHorizontalPadding: false }),
                styles.hexInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  borderRadius: surfaceRadius.input,
                  backgroundColor: colors.surfaceMuted,
                },
              ]}
            />
          </View>

          <View style={[styles.rgbRow, { gap: spacing.sm }]}>
            <ChannelInput label={t('common.color.channelR')} value={rgb.r} onChange={(r) => applyRgb('r', r)} />
            <ChannelInput label={t('common.color.channelG')} value={rgb.g} onChange={(g) => applyRgb('g', g)} />
            <ChannelInput label={t('common.color.channelB')} value={rgb.b} onChange={(b) => applyRgb('b', b)} />
          </View>

          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.fieldLabel, { color: colors.textMuted }]}>{t('common.color.presets')}</Text>
            <View style={styles.presetGrid}>
              {PRESET_COLORS.map((color) => {
                const selected = previewHex.toLowerCase() === color.toLowerCase();
                return (
                  <Pressable
                    key={color}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.color.preset', { color })}
                    onPress={() => applyHsv(hexToHsv(color))}
                    style={[
                      styles.presetSwatch,
                      {
                        backgroundColor: color,
                        borderColor: selected ? colors.primary : colors.border,
                        borderWidth: selected ? 2 : 1,
                        borderRadius: surfaceRadius.button,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  nonInteractiveLayer: {
    pointerEvents: 'none',
  },
  gestureRoot: {
    width: '100%',
  },
  previewBar: {
    height: 44,
    borderWidth: 1,
  },
  svPanel: {
    height: 196,
    borderWidth: 1,
    overflow: 'hidden',
  },
  svThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderWidth: 3,
    ...platformShadow(
      {
        shadowColor: '#1B1A17',
        shadowOpacity: 0.28,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 3,
      },
      { boxShadow: '0 1px 3px rgba(27, 26, 23, 0.28)' },
    ),
  },
  hueWrap: {
    height: 40,
    justifyContent: 'center',
  },
  hueTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 14,
    borderWidth: 1,
  },
  hueSlider: {
    width: '100%',
    height: 40,
  },
  hexInput: {
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  rgbRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  channelInput: {
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetSwatch: {
    width: 34,
    height: 34,
  },
});
