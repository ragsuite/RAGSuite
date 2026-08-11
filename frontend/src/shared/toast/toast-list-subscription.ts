import type { ToastRecord } from '@/shared/toast/toast.types';

type Listener = () => void;

let snapshot: ToastRecord[] = [];
const listeners = new Set<Listener>();

export function getToastListSnapshot(): readonly ToastRecord[] {
  return snapshot;
}

export function setToastListSnapshot(next: ToastRecord[]): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeToastList(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateToastList(updater: (current: ToastRecord[]) => ToastRecord[]): void {
  setToastListSnapshot(updater([...snapshot]));
}
