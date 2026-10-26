import {
  SIDE_PANEL_RESIZE_MAX,
  SIDE_PANEL_RESIZE_MIN,
  clampSidePanelWidth,
  nextSidePanelWidth,
} from '@/shared/components/adaptive/use-side-panel-resize';

describe('clampSidePanelWidth', () => {
  it('clamps below the minimum', () => {
    expect(clampSidePanelWidth(200, 1400)).toBe(SIDE_PANEL_RESIZE_MIN);
  });

  it('clamps above the max and viewport gutter', () => {
    expect(clampSidePanelWidth(2000, 1400)).toBe(SIDE_PANEL_RESIZE_MAX);
    expect(clampSidePanelWidth(2000, 500)).toBe(436);
  });

  it('keeps a value inside the range', () => {
    expect(clampSidePanelWidth(520, 1400)).toBe(520);
  });
});

describe('nextSidePanelWidth', () => {
  it('widens the right panel when dragging left', () => {
    expect(nextSidePanelWidth(576, 400, 350, 1400)).toBe(626);
  });

  it('narrows the right panel when dragging right', () => {
    expect(nextSidePanelWidth(576, 400, 450, 1400)).toBe(526);
  });
});
