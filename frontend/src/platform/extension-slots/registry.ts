import type { ComponentType } from 'react';

import type { ExtensionSlotId } from '@/platform/extension-slots/types';

const slots = new Map<ExtensionSlotId, ComponentType<Record<string, unknown>>>();

export function registerExtensionSlot(
  id: ExtensionSlotId,
  component: ComponentType<Record<string, unknown>>,
): void {
  slots.set(id, component);
}

export function getExtensionSlot(
  id: ExtensionSlotId,
): ComponentType<Record<string, unknown>> | undefined {
  return slots.get(id);
}

export function resetExtensionSlots(): void {
  slots.clear();
}
