import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RichTextEditorSurface } from '@/shared/components/rich-text-editor/RichTextEditorSurface';
import { useRichTextLabels, useRichTextTheme } from '@/shared/components/rich-text-editor/use-rich-text-config';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { plainTextToRichHtml, richTextLength } from '@/shared/utils/rich-text';

const MAX_PENDING_ECHOES = 64;

type Props = {
  /** Editor HTML; legacy plain text is converted to paragraphs on load. */
  value: string;
  onChange: (html: string) => void;
  label?: string;
  placeholder?: string;
  /** Visible-character limit (counter turns red above it; callers block save). */
  maxTextLength?: number;
  minHeight?: number;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  testID?: string;
};

/**
 * Shared rich text field (FAQ answers, Text / Q&A sources). Emits sanitizable
 * editor HTML; empty content is emitted as ''.
 */
export function RichTextEditor({
  value,
  onChange,
  label,
  placeholder = '',
  maxTextLength,
  minHeight = 160,
  disabled = false,
  error,
  helperText,
  testID,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const theme = useRichTextTheme();
  const labels = useRichTextLabels();
  const syncedValue = useRef(value);
  /** Emitted HTML not yet echoed back via `value` (native echoes cross the WebView bridge late). */
  const pendingEchoes = useRef<string[]>([]);
  const [external, setExternal] = useState(() => ({ value: plainTextToRichHtml(value), version: 0 }));

  useEffect(() => {
    const echoes = pendingEchoes.current;
    const echoAt = echoes.indexOf(value);
    if (echoAt >= 0) {
      echoes.splice(0, echoAt + 1);
      syncedValue.current = value;
      return;
    }
    if (value === syncedValue.current) return;
    syncedValue.current = value;
    echoes.length = 0;
    setExternal((prev) => ({ value: plainTextToRichHtml(value), version: prev.version + 1 }));
  }, [value]);

  const handleChange = useCallback(
    (html: string) => {
      const echoes = pendingEchoes.current;
      echoes.push(html);
      if (echoes.length > MAX_PENDING_ECHOES) echoes.shift();
      onChange(html);
    },
    [onChange],
  );

  const length = richTextLength(value);
  const overLimit = maxTextLength != null && length > maxTextLength;
  const message = error || helperText;

  return (
    <View style={[styles.stack, { gap: spacing.xxs }]} testID={testID}>
      {label ? <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text> : null}
      <RichTextEditorSurface
        externalValue={external.value}
        externalVersion={external.version}
        placeholder={placeholder}
        ariaLabel={label || placeholder}
        theme={theme}
        labels={labels}
        disabled={disabled}
        minHeight={minHeight}
        invalid={Boolean(error) || overLimit}
        onChange={handleChange}
      />
      {message || maxTextLength != null ? (
        <View style={[styles.footer, { gap: spacing.sm }]}>
          <Text style={[typography.caption, styles.message, { color: error ? colors.danger : colors.textSoft }]}>
            {message ?? ''}
          </Text>
          {maxTextLength != null ? (
            <Text
              style={[typography.caption, typography.numeric, { color: overLimit ? colors.danger : colors.textSoft }]}
              accessibilityLiveRegion="polite">
              {length.toLocaleString()} / {maxTextLength.toLocaleString()}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  message: {
    flex: 1,
  },
});
