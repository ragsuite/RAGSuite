import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';

import type { PopoverAnchor } from '@/shared/components/adaptive/anchored-popover-layout';
import { measurePopoverAnchor } from '@/shared/utils/measure-popover-anchor';

/** Shared open/close + viewport-accurate anchor measurement for anchored menus/selects. */
export function usePopoverAnchor() {
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);

  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    setAnchor(null);
  }, []);

  const openMenu = useCallback(() => {
    measurePopoverAnchor(anchorRef.current, (measured) => {
      setAnchor(measured);
      openRef.current = true;
      setOpen(true);
    });
  }, []);

  const toggle = useCallback(() => {
    if (openRef.current) {
      close();
      return;
    }
    openMenu();
  }, [close, openMenu]);

  return {
    anchorRef,
    open,
    anchor,
    openMenu,
    close,
    toggle,
    setOpen,
  };
}
