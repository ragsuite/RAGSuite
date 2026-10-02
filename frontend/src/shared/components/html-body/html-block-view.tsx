import React from 'react';
import { ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';

import {
  renderInlineNodes,
  type HtmlInlineDecor,
  type HtmlSpeechOptions,
  type HtmlTextBaseStyle,
} from '@/shared/components/html-body/html-inline-text';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { HtmlContentBlock, HtmlTableRow } from '@/shared/utils/html-content';

export type HtmlBlockContext = {
  bodyStyle: HtmlTextBaseStyle;
  headingStyle: HtmlTextBaseStyle;
  decor: HtmlInlineDecor;
  compact: boolean;
  speech?: HtmlSpeechOptions;
};

type Props = { block: HtmlContentBlock; index: number; ctx: HtmlBlockContext };

const LIST_INDENT = 16;
const MARKER_MIN_WIDTH = 14;
const TABLE_CELL_WIDTH = 160;

function TableBlock({ rows, keyPrefix, ctx }: { rows: HtmlTableRow[]; keyPrefix: string; ctx: HtmlBlockContext }) {
  const { colors, spacing } = useAppTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.table, { borderColor: colors.border }]}>
        {rows.map((row, r) => (
          <View key={`${keyPrefix}_r${r}`} style={styles.tableRow}>
            {row.cells.map((cell, c) => {
              const base = row.header ? ctx.headingStyle : ctx.bodyStyle;
              return (
                <View
                  key={`${keyPrefix}_r${r}c${c}`}
                  style={[
                    styles.tableCell,
                    {
                      borderColor: colors.border,
                      padding: spacing.xs,
                      backgroundColor: row.header ? colors.surfaceMuted : undefined,
                    },
                  ]}>
                  <Text style={base}>
                    {renderInlineNodes(cell, `${keyPrefix}_r${r}c${c}`, { ...ctx, baseStyle: base })}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function BlockContent({ block, index, ctx }: Props) {
  const { colors, spacing, fonts, surfaceRadius } = useAppTheme();
  const key = `${block.type}_${index}`;
  if (block.type === 'rule') {
    return <View style={[styles.rule, { backgroundColor: colors.border, marginVertical: spacing.xs }]} />;
  }
  if (block.type === 'table') return <TableBlock rows={block.rows} keyPrefix={key} ctx={ctx} />;

  const layout: TextStyle = {
    ...(block.type !== 'bullet' && block.align ? { textAlign: block.align } : null),
    ...(block.type !== 'bullet' && block.indent ? { marginLeft: block.indent * spacing.lg } : null),
  };
  const textColor = block.quote ? colors.textSoft : ctx.bodyStyle.color;

  if (block.type === 'heading') {
    const base = { ...ctx.headingStyle, color: textColor };
    return (
      <Text style={[base, layout, { marginTop: index > 0 ? spacing.xs : 0 }]}>
        {renderInlineNodes(block.inline, key, { ...ctx, baseStyle: base })}
      </Text>
    );
  }

  if (block.type === 'bullet') {
    const base = { ...ctx.bodyStyle, color: textColor };
    return (
      <View style={[styles.bulletRow, { marginLeft: (block.depth - 1) * LIST_INDENT }]}>
        <Text style={[base, styles.marker, { color: colors.textMuted }]}>{block.marker}</Text>
        <Text style={[base, styles.flex]}>{renderInlineNodes(block.inline, key, { ...ctx, baseStyle: base })}</Text>
      </View>
    );
  }

  const base: HtmlTextBaseStyle = block.preformatted
    ? { ...ctx.bodyStyle, color: textColor, fontFamily: fonts.mono }
    : { ...ctx.bodyStyle, color: textColor };
  const preStyle = block.preformatted
    ? { backgroundColor: colors.surfaceMuted, padding: spacing.sm, borderRadius: surfaceRadius.input }
    : null;
  return (
    <Text style={[base, layout, preStyle]}>{renderInlineNodes(block.inline, key, { ...ctx, baseStyle: base })}</Text>
  );
}

/** One parsed HTML block; quoted blocks get a left rule per nesting level. */
export function HtmlBlockView(props: Props) {
  const { colors, spacing } = useAppTheme();
  const quote = props.block.quote ?? 0;
  if (quote === 0) return <BlockContent {...props} />;
  return (
    <View
      style={[
        styles.quote,
        { borderLeftColor: colors.borderStrong, paddingLeft: spacing.sm, marginLeft: (quote - 1) * spacing.sm },
      ]}>
      <BlockContent {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  marker: { minWidth: MARKER_MIN_WIDTH },
  flex: { flex: 1 },
  rule: { height: StyleSheet.hairlineWidth },
  quote: { borderLeftWidth: 3 },
  table: { borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    width: TABLE_CELL_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
