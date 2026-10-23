import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { CrawlSourceTableRow } from '@/features/crawl/components/CrawlSourceTableRow';
import type { CrawlSource } from '@/features/crawl/types/crawl.types';

jest.mock('@/features/crawl/components/CrawlSourceProgressBar', () => ({
  CrawlSourceProgressBar: () => null,
}));
jest.mock('@/features/crawl/components/CrawlStatusBadge', () => ({
  CrawlStatusBadge: () => null,
}));
jest.mock('@/features/crawl/components/CrawlSourceRowParts', () => ({
  CrawlSettingsSummary: () => null,
  ModelLabelStack: () => null,
  SourceIdentity: () => null,
  SourceMenuButton: () => null,
  TrainingSummary: () => null,
}));
jest.mock('@/shared/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: { text: '#111', border: '#ccc', surface: '#fff', surfaceMuted: '#eee' },
    spacing: { sm: 8 },
    typography: { caption: { fontSize: 12 } },
    surfaceRadius: { button: 8 },
  }),
}));

const source = {
  id: 's1',
  name: 'T3planet',
  documents_count: 607,
} as CrawlSource;

const baseProps = {
  source,
  modelLabels: ['Mistral / mistral-embed'],
  trained: true,
  statusLabel: 'Active',
  statusTone: 'success' as const,
  showProgress: false,
  progressValue: 0,
  showCoverageWarning: false,
  answersSwitch: null,
  onOpenMenu: () => undefined,
};

function renderRow(onPress?: () => void) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<CrawlSourceTableRow {...baseProps} onPress={onPress} />);
  });
  return tree!;
}

describe('CrawlSourceTableRow write lock', () => {
  it('is not a button when the row has no press handler', () => {
    const tree = renderRow();
    expect(() => tree.root.findByProps({ accessibilityRole: 'button' })).toThrow();
  });

  it('stays clickable when a press handler is provided', () => {
    const onPress = jest.fn();
    const tree = renderRow(onPress);
    const button = tree.root.findByProps({
      accessibilityRole: 'button',
      accessibilityLabel: 'T3planet, Active',
    });
    act(() => {
      button.props.onPress();
    });
    expect(onPress).toHaveBeenCalled();
  });
});
