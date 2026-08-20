import React from 'react';

import { getExtensionSlot } from '@/platform/extension-slots/registry';
import type {
  ExtensionSlotId,
  ExtensionSlotPropsMap,
} from '@/platform/extension-slots/types';
import { ComponentErrorBoundary } from '@/shared/components/error/component-error-boundary';

type Props<K extends ExtensionSlotId> = { name: K } & ExtensionSlotPropsMap[K];

/** Renders a registered EE contribution, or nothing when CE / unregistered. */
export function ExtensionSlot<K extends ExtensionSlotId>(props: Props<K>) {
  const { name, ...rest } = props;
  const Component = getExtensionSlot(name);
  if (!Component) return null;
  return (
    <ComponentErrorBoundary componentName={`ExtensionSlot:${name}`} fallback={null}>
      <Component {...(rest as Record<string, unknown>)} />
    </ComponentErrorBoundary>
  );
}
