import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { CrawlSourcesTable } from '@/features/crawl/components/CrawlSourcesTable';
import type { CrawlSource } from '@/features/crawl/types/crawl.types';

jest.mock('@/shared/components/app-scroll-view', () => {
  const ReactLib = require('react');
  const ReactNative = require('react-native');
  return {
    AppScrollView: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(ReactNative.View, null, children),
  };
});
jest.mock('@/features/crawl/components/CrawlSourcesTableHeader', () => ({
  CrawlSourcesTableHeader: () => null,
}));
jest.mock('@/features/crawl/components/CrawlSourceRow', () => {
  const ReactLib = require('react');
  const ReactNative = require('react-native');
  return {
    CrawlSourceRow: ({ onPress, source }: { onPress?: () => void; source: { name: string } }) =>
      onPress
        ? ReactLib.createElement(ReactNative.Pressable, {
            accessibilityRole: 'button',
            accessibilityLabel: source.name,
            onPress,
          })
        : ReactLib.createElement(ReactNative.View, { accessibilityLabel: source.name }),
  };
});
jest.mock('@/features/crawl/hooks/useCrawlLayout', () => ({
  useCrawlLayout: () => ({ useTableHorizontalScroll: false, sourcesTableMinWidth: 900 }),
}));
jest.mock('@/shared/hooks/use-measured-width', () => ({
  useMeasuredWidth: () => ({ width: 1200, onLayout: () => undefined }),
}));
jest.mock('@/shared/hooks/use-app-theme', () => ({
  useAppTheme: () => ({ colors: { border: '#ccc' } }),
}));
jest.mock('@/features/crawl/utils/crawl-embedding-display', () => ({
  expandCrawlSourcesForTable: (sources: CrawlSource[]) =>
    sources.map((source) => ({ rowKey: source.id, source, modelLabels: [] })),
}));

const source = {
  id: 's1',
  name: 'T3planet',
} as CrawlSource;

function renderTable(onPressSource?: (sourceId: string) => void) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <CrawlSourcesTable
        sources={[source]}
        onOpenMenu={() => undefined}
        onPressSource={onPressSource}
      />,
    );
  });
  return tree!;
}

describe('CrawlSourcesTable read-only rows', () => {
  it('does not make the source row a button without onPressSource', () => {
    const tree = renderTable();
    expect(() => tree.root.findByProps({ accessibilityRole: 'button' })).toThrow();
    expect(tree.root.findByProps({ accessibilityLabel: 'T3planet' })).toBeTruthy();
  });

  it('keeps the source row clickable when onPressSource is provided', () => {
    const onPressSource = jest.fn();
    const tree = renderTable(onPressSource);
    const button = tree.root.findByProps({ accessibilityRole: 'button', accessibilityLabel: 'T3planet' });
    act(() => {
      button.props.onPress();
    });
    expect(onPressSource).toHaveBeenCalledWith('s1');
  });
});
