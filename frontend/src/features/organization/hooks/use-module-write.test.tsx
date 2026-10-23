import React from 'react';
import renderer, { act } from 'react-test-renderer';

import {
  ModuleWriteProvider,
  useFieldWriteLock,
  useModuleWriteEnabled,
} from '@/features/organization/hooks/use-module-write';

let last: { canWrite: boolean; locked: boolean } | null = null;

function Probe({
  disabled,
  ignoreModuleLock,
}: {
  disabled?: boolean;
  ignoreModuleLock?: boolean;
}) {
  last = {
    canWrite: useModuleWriteEnabled(),
    locked: useFieldWriteLock(disabled, { ignoreModuleLock }),
  };
  return null;
}

describe('useFieldWriteLock', () => {
  beforeEach(() => {
    last = null;
  });

  it('locks when the module cannot write', () => {
    act(() => {
      renderer.create(
        <ModuleWriteProvider canWrite={false}>
          <Probe />
        </ModuleWriteProvider>,
      );
    });
    expect(last).toEqual({ canWrite: false, locked: true });
  });

  it('stays unlocked when the module can write', () => {
    act(() => {
      renderer.create(
        <ModuleWriteProvider canWrite={true}>
          <Probe />
        </ModuleWriteProvider>,
      );
    });
    expect(last).toEqual({ canWrite: true, locked: false });
  });

  it('locks when the control is explicitly disabled even if write is allowed', () => {
    act(() => {
      renderer.create(
        <ModuleWriteProvider canWrite={true}>
          <Probe disabled />
        </ModuleWriteProvider>,
      );
    });
    expect(last?.locked).toBe(true);
  });

  it('defaults to writable when no provider is present', () => {
    act(() => {
      renderer.create(<Probe />);
    });
    expect(last).toEqual({ canWrite: true, locked: false });
  });

  it('ignores module read-only when ignoreModuleLock is set', () => {
    act(() => {
      renderer.create(
        <ModuleWriteProvider canWrite={false}>
          <Probe ignoreModuleLock />
        </ModuleWriteProvider>,
      );
    });
    expect(last).toEqual({ canWrite: false, locked: false });
  });

  it('still honors an explicit disabled flag when ignoreModuleLock is set', () => {
    act(() => {
      renderer.create(
        <ModuleWriteProvider canWrite={false}>
          <Probe disabled ignoreModuleLock />
        </ModuleWriteProvider>,
      );
    });
    expect(last?.locked).toBe(true);
  });
});
