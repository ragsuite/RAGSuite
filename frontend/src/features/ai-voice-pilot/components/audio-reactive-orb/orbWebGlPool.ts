/**
 * Shared Three.js load + WebGL context budget for voice orbs.
 * Browsers typically allow ~8–16 contexts; exceeding that blanks canvases.
 */

import type { OrbSceneHandle } from './createOrbScene';

const MAX_CONTEXTS = 6;

type Slot = {
  id: string;
  handle: OrbSceneHandle;
  priority: number;
};

let threeModulePromise: Promise<typeof import('three')> | null = null;
let createChain: Promise<void> = Promise.resolve();
const live = new Map<string, Slot>();

export function preloadThree(): Promise<typeof import('three')> {
  if (!threeModulePromise) {
    threeModulePromise = import('three');
  }
  return threeModulePromise;
}

function evictLowestPriority(exceptId: string) {
  if (live.size < MAX_CONTEXTS) return;
  let victim: Slot | null = null;
  for (const slot of live.values()) {
    if (slot.id === exceptId) continue;
    if (!victim || slot.priority < victim.priority) victim = slot;
  }
  if (!victim) return;
  try {
    victim.handle.stop();
    victim.handle.dispose();
  } catch {
    /* ignore */
  }
  live.delete(victim.id);
}

/**
 * Serialize scene creation and enforce a hard context cap.
 * Priority: higher = keep (active orb should pass e.g. 100).
 */
export async function acquireOrbScene(
  id: string,
  priority: number,
  factory: () => Promise<OrbSceneHandle>,
): Promise<OrbSceneHandle> {
  await preloadThree();

  const prev = live.get(id);
  if (prev) {
    try {
      prev.handle.stop();
      prev.handle.dispose();
    } catch {
      /* ignore */
    }
    live.delete(id);
  }

  evictLowestPriority(id);

  const handle = await new Promise<OrbSceneHandle>((resolve, reject) => {
    createChain = createChain
      .catch(() => undefined)
      .then(async () => {
        evictLowestPriority(id);
        // Brief yield so layout settles before WebGL allocate.
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        const scene = await factory();
        live.set(id, { id, handle: scene, priority });
        resolve(scene);
      })
      .catch((err) => {
        reject(err);
      });
  });

  return handle;
}

export function releaseOrbScene(id: string) {
  const slot = live.get(id);
  if (!slot) return;
  try {
    slot.handle.stop();
    slot.handle.dispose();
  } catch {
    /* ignore */
  }
  live.delete(id);
}

export function bumpOrbPriority(id: string, priority: number) {
  const slot = live.get(id);
  if (slot) slot.priority = priority;
}
