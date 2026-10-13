import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/** Width of the view receiving `onLayout`; 0 until the first layout pass. */
export function useMeasuredWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((previous) => (previous === next ? previous : next));
  }, []);
  return { width, onLayout };
}
