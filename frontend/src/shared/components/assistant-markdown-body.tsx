import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';
import {
  parseAssistantMarkdownBlocks,
  type AssistantMarkdownBlock,
} from '@/shared/utils/parse-assistant-markdown';
import { openCitationUrl } from '@/shared/utils/open-citation-url';

type Props = {
  content: string;
  textColor: string;
  mutedColor: string;
  linkColor: string;
  codeBackgroundColor: string;
  fontSize: number;
  headingFontWeight?: '500' | '600' | '700';
  strongFontWeight?: '500' | '600' | '700';
  /** Optional trailing node (e.g. streaming cursor). */
  trailing?: React.ReactNode;
};

function renderInlineMarkdown(
  text: string,
  {
    textColor,
    linkColor,
    codeBackgroundColor,
    fontSize,
    monoFontFamily,
    sansFontFamily,
    strongFontWeight = '700',
  }: Pick<Props, 'textColor' | 'linkColor' | 'codeBackgroundColor' | 'fontSize' | 'strongFontWeight'> & {
    monoFontFamily: string;
    sansFontFamily: string;
  },
) {
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(pattern).filter((part) => part.length > 0);

  return parts.map((part, index) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      return (
        <Text
          key={`link_${index}`}
          accessibilityRole="link"
          onPress={() => {
            void openCitationUrl(href).catch(() => {});
          }}
          style={{ color: linkColor, textDecorationLine: 'underline', fontSize, fontFamily: sansFontFamily }}>
          {label}
        </Text>
      );
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <Text
          key={`code_${index}`}
          style={{
            fontFamily: monoFontFamily,
            backgroundColor: codeBackgroundColor,
            fontSize: fontSize - 1,
            color: textColor,
          }}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={`bold_${index}`} style={{ fontWeight: strongFontWeight, color: textColor, fontSize, fontFamily: sansFontFamily }}>
          {part.slice(2, -2)}
        </Text>
      );
    }

    if (
      (part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    ) {
      return (
        <Text key={`italic_${index}`} style={{ fontStyle: 'italic', color: textColor, fontSize, fontFamily: sansFontFamily }}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    return part;
  });
}

function MarkdownTable({
  block,
  textColor,
  mutedColor,
  borderColor,
  headerBackground,
  fontSize,
  lineHeight,
  inlineOpts,
}: {
  block: Extract<AssistantMarkdownBlock, { type: 'table' }>;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  headerBackground: string;
  fontSize: number;
  lineHeight: number;
  inlineOpts: Parameters<typeof renderInlineMarkdown>[1];
}) {
  const colCount = Math.max(block.headers.length, 1);
  const minColWidth = Math.max(72, Math.min(160, Math.floor(480 / colCount)));

  const renderRow = (cells: string[], keyPrefix: string, header: boolean) => (
    <View
      key={keyPrefix}
      style={[
        styles.tableRow,
        {
          borderBottomColor: borderColor,
          backgroundColor: header ? headerBackground : 'transparent',
        },
      ]}>
      {cells.map((cell, cellIndex) => (
        <View
          key={`${keyPrefix}_c_${cellIndex}`}
          style={[
            styles.tableCell,
            {
              borderRightColor: borderColor,
              minWidth: minColWidth,
              maxWidth: minColWidth * 2,
              borderRightWidth: cellIndex < cells.length - 1 ? StyleSheet.hairlineWidth : 0,
            },
          ]}>
          <Text
            style={{
              color: header ? textColor : textColor,
              fontWeight: header ? '700' : '400',
              fontSize: header ? fontSize : fontSize - 0.5,
              lineHeight: lineHeight - 2,
              fontFamily: inlineOpts.sansFontFamily,
            }}>
            {renderInlineMarkdown(cell, inlineOpts)}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator
      style={styles.tableScroll}
      contentContainerStyle={[styles.tableFrame, { borderColor }]}>
      <View>
        {renderRow(block.headers, 'th', true)}
        {block.rows.map((row, rowIndex) => renderRow(row, `tr_${rowIndex}`, false))}
        {block.rows.length === 0 ? (
          <Text style={{ color: mutedColor, fontSize: fontSize - 1, padding: 8 }}> </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

/**
 * Renders assistant markdown (including GFM pipe tables). Does not handle HTML —
 * callers should route HTML to AppHtmlBody.
 */
export function AssistantMarkdownBody({
  content,
  textColor,
  mutedColor,
  linkColor,
  codeBackgroundColor,
  fontSize,
  headingFontWeight = '700',
  strongFontWeight = '700',
  trailing = null,
}: Props) {
  const { surfaceRadius, fonts, colors } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const monoFontFamily = fonts.mono;
  const sansFontFamily = fonts.sans;
  const headingFontFamily = fonts.sansSemiBold;
  const lineHeight = Math.max(24, fontSize + 10);
  const blocks = useMemo(() => parseAssistantMarkdownBlocks(content), [content]);
  const inlineOpts = {
    textColor,
    linkColor,
    codeBackgroundColor,
    fontSize,
    monoFontFamily,
    sansFontFamily,
    strongFontWeight,
  };

  if (!content.trim()) return null;

  return (
    <View style={styles.wrap}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <Text
              key={`h_${index}`}
              style={{
                color: textColor,
                fontWeight: headingFontWeight,
                fontFamily: headingFontFamily,
                fontSize: block.level === 2 ? fontSize + 1 : fontSize,
                lineHeight: lineHeight + 2,
                marginTop: index > 0 ? 4 : 0,
              }}>
              {renderInlineMarkdown(block.text, inlineOpts)}
            </Text>
          );
        }

        if (block.type === 'bullet') {
          return (
            <View key={`b_${index}`} style={styles.listRow}>
              <Text style={{ color: mutedColor, fontSize, lineHeight, fontFamily: sansFontFamily }}>•</Text>
              <Text style={{ flexShrink: 1, color: textColor, fontSize, lineHeight, fontFamily: sansFontFamily }}>
                {renderInlineMarkdown(block.text, inlineOpts)}
              </Text>
            </View>
          );
        }

        if (block.type === 'ordered') {
          return (
            <View key={`o_${index}`} style={styles.listRow}>
              <Text style={{ color: mutedColor, fontSize, lineHeight, minWidth: 18, fontFamily: sansFontFamily }}>{block.index}.</Text>
              <Text style={{ flexShrink: 1, color: textColor, fontSize, lineHeight, fontFamily: sansFontFamily }}>
                {renderInlineMarkdown(block.text, inlineOpts)}
              </Text>
            </View>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <View key={`q_${index}`} style={[styles.blockquote, { borderLeftColor: mutedColor }]}>
              <Text style={{ color: mutedColor, fontSize, lineHeight, fontStyle: 'italic', fontFamily: sansFontFamily }}>
                {renderInlineMarkdown(block.text, {
                  ...inlineOpts,
                  textColor: mutedColor,
                })}
              </Text>
            </View>
          );
        }

        if (block.type === 'code') {
          return (
            <View
              key={`c_${index}`}
              style={[styles.codeBlock, { backgroundColor: codeBackgroundColor, borderRadius: panelRadius }]}>
              <Text
                style={{
                  color: textColor,
                  fontFamily: monoFontFamily,
                  fontSize: fontSize - 1,
                  lineHeight: fontSize + 6,
                }}>
                {block.text}
              </Text>
            </View>
          );
        }

        if (block.type === 'table') {
          return (
            <MarkdownTable
              key={`t_${index}`}
              block={block}
              textColor={textColor}
              mutedColor={mutedColor}
              borderColor={colors.border}
              headerBackground={codeBackgroundColor}
              fontSize={fontSize}
              lineHeight={lineHeight}
              inlineOpts={inlineOpts}
            />
          );
        }

        return (
          <Text key={`p_${index}`} style={{ color: textColor, fontSize, lineHeight, fontFamily: sansFontFamily }}>
            {renderInlineMarkdown(block.text, inlineOpts)}
          </Text>
        );
      })}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    maxWidth: '100%',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: '100%',
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 10,
  },
  codeBlock: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  tableScroll: {
    maxWidth: '100%',
  },
  tableFrame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexGrow: 1,
  },
});
