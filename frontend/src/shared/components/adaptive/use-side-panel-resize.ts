import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export const SIDE_PANEL_RESIZE_MIN = 384;
export const SIDE_PANEL_RESIZE_MAX = 960;
export const SIDE_PANEL_RESIZE_VIEWPORT_GUTTER = 64;
export const SIDE_PANEL_RESIZE_HIT_WIDTH = 8;

export function clampSidePanelWidth(width: number, viewportWidth: number): number {
  const max = Math.max(0, Math.min(viewportWidth - SIDE_PANEL_RESIZE_VIEWPORT_GUTTER, SIDE_PANEL_RESIZE_MAX));
  const min = Math.min(SIDE_PANEL_RESIZE_MIN, max);
  return Math.min(max, Math.max(min, width));
}

export function nextSidePanelWidth(
  startWidth: number,
  startX: number,
  clientX: number,
  viewportWidth: number,
): number {
  return clampSidePanelWidth(startWidth + (startX - clientX), viewportWidth);
}

type Options = {
  enabled: boolean;
  baseWidth: number;
  viewportWidth: number;
  open: boolean;
};

export function useSidePanelResize({ enabled, baseWidth, viewportWidth, open }: Options) {
  const [width, setWidth] = useState(() => clampSidePanelWidth(baseWidth, viewportWidth));
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef(width);
  const viewportRef = useRef(viewportWidth);
  widthRef.current = width;
  viewportRef.current = viewportWidth;

  useEffect(() => {
    if (!open) return;
    setWidth(clampSidePanelWidth(baseWidth, viewportRef.current));
  }, [open, baseWidth]);

  useEffect(() => {
    setWidth((current) => clampSidePanelWidth(current, viewportWidth));
  }, [viewportWidth]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;

    const onMove = (event: MouseEvent) => {
      if (!dragRef.current) return;
      setWidth(
        nextSidePanelWidth(dragRef.current.startWidth, dragRef.current.startX, event.clientX, viewportWidth),
      );
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [enabled, viewportWidth]);

  const startResize = useCallback(
    (clientX: number) => {
      if (!enabled) return;
      dragRef.current = {
        startX: clientX,
        startWidth: clampSidePanelWidth(widthRef.current, viewportWidth),
      };
      setResizing(true);
      if (Platform.OS === 'web') {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }
    },
    [enabled, viewportWidth],
  );

  return { width, resizing, startResize, enabled };
}
