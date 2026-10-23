import React from 'react';
import { Switch } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { ModuleWriteProvider } from '@/features/organization/hooks/use-module-write';
import { TrainingActiveConfigPanel } from '@/features/search-config/components/training/TrainingActiveConfigPanel';

const mockHandleSaveSearchStatus = jest.fn();

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/shared/constants/action-icons', () => ({
  ActionIcons: new Proxy({}, { get: () => () => null }),
}));
jest.mock('@/features/search-config/components/SearchConfigPanelCard', () => ({
  SearchConfigPanelCard: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/shared/components/dashboard/state-panel', () => ({
  StatePanel: ({ children, isEmpty }: { children: React.ReactNode; isEmpty?: boolean }) =>
    isEmpty ? null : children,
}));
jest.mock('@/shared/components/status-badge', () => ({ StatusBadge: () => null }));
jest.mock('@/shared/components/app-select-field', () => ({ AppSelectField: () => null }));
jest.mock('@/shared/components/app-button', () => ({ AppButton: () => null }));
jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/shared/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      text: '#111',
      textMuted: '#888',
      border: '#ccc',
      surface: '#fff',
      primary: '#0a0',
    },
    spacing: { sm: 8, xxs: 2 },
    typography: {
      fieldLabel: { fontSize: 13 },
      body: { fontSize: 14 },
      caption: { fontSize: 12 },
      fieldInput: { fontSize: 14 },
    },
    surfaceRadius: { input: 8 },
  }),
}));
jest.mock('@/features/search-config/hooks/useSearchConfigLayout', () => ({
  useSearchConfigLayout: () => ({ isCompact: false }),
}));
jest.mock('@/features/search-config/hooks/useSearchConfig', () => ({
  useSearchConfig: () => ({
    bundle: {
      activeConfig: { name: 'Search', documentCount: 0 },
      trainingOverview: { searchReady: true },
      modelSettings: { systemPrompt: 'You are a helpful AI search widget.' },
      searchResponseConfig: { responseType: 'long' },
    },
    saving: false,
    handleSaveSystemPrompt: jest.fn(),
    handleSaveResponseConfig: jest.fn(),
    handleSaveSearchStatus: mockHandleSaveSearchStatus,
  }),
}));

function renderPanel(canWrite: boolean) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ModuleWriteProvider canWrite={canWrite}>
        <TrainingActiveConfigPanel />
      </ModuleWriteProvider>,
    );
  });
  return tree!;
}

describe('Search TrainingActiveConfigPanel write lock', () => {
  beforeEach(() => {
    mockHandleSaveSearchStatus.mockClear();
  });

  it('disables the Search Status switch when the module is read-only', () => {
    const tree = renderPanel(false);
    const statusSwitch = tree.root.findByType(Switch);
    expect(statusSwitch.props.disabled).toBe(true);
    expect(statusSwitch.props.accessibilityLabel).toBe('Search status');
    expect(statusSwitch.parent?.props.pointerEvents).toBe('none');
  });

  it('keeps the Search Status switch enabled when the module can write', () => {
    const tree = renderPanel(true);
    const statusSwitch = tree.root.findByType(Switch);
    expect(statusSwitch.props.disabled).toBe(false);
    act(() => {
      statusSwitch.props.onValueChange?.(false);
    });
    expect(mockHandleSaveSearchStatus).toHaveBeenCalledWith(false);
  });

  it('keeps the system prompt read-only when the module cannot write', () => {
    const tree = renderPanel(false);
    const prompt = tree.root.findByProps({ accessibilityLabel: 'search.prompt.label' });
    expect(prompt.props.editable).toBe(false);
  });
});
