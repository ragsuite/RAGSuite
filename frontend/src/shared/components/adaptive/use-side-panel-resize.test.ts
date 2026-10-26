import {
  clampSidePanelWidth,
  nextSidePanelWidth,
  sidePanelResizeMax,
  sidePanelResizeMin,
} from '@/shared/components/adaptive/use-side-panel-resize';

describe('clampSidePanelWidth', () => {
  it('clamps below 30% of the viewport', () => {
    expect(clampSidePanelWidth(200, 1400)).toBe(420);
    expect(sidePanelResizeMin(1400)).toBe(420);
  });

  it('clamps above 80% of the viewport', () => {
    expect(clampSidePanelWidth(2000, 1400)).toBe(1120);
    expect(sidePanelResizeMax(1400)).toBe(1120);
    expect(clampSidePanelWidth(2000, 500)).toBe(400);
    expect(sidePanelResizeMin(500)).toBe(150);
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
