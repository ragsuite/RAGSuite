import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';

import type { PopoverAnchor } from '@/shared/components/adaptive/anchored-popover-layout';
import { measurePopoverAnchor } from '@/shared/utils/measure-popover-anchor';

/** Shared open/close + viewport-accurate anchor measurement for anchored menus/selects. */
export function usePopoverAnchor() {
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setAnchor(null);
  }, []);

  const openMenu = useCallback(() => {
    measurePopoverAnchor(anchorRef.current, (measured) => {
      setAnchor(measured);
      setOpen(true);
    });
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    openMenu();
  }, [close, open, openMenu]);

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
