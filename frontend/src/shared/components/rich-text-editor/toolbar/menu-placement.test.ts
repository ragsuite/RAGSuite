/**
 * @jest-environment jsdom
 */
import { computeMenuPlacement } from '@/shared/components/rich-text-editor/toolbar/menu-placement';

type Rect = { left: number; top: number; width: number; height: number };

function withRect(element: HTMLElement, { left, top, width, height }: Rect) {
  element.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
  return element;
}

function setup(anchorRect: Rect, menuSize: { width: number; height: number }) {
  const clip = withRect(document.createElement('div'), { left: 100, top: 0, width: 500, height: 600 });
  clip.style.overflowX = 'hidden';
  clip.style.overflowY = 'hidden';
  const anchor = withRect(document.createElement('div'), anchorRect);
  clip.appendChild(anchor);
  document.body.appendChild(clip);
  const menu = withRect(document.createElement('div'), { left: 0, top: 0, ...menuSize });
  return { anchor, menu };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('computeMenuPlacement', () => {
  it('keeps the preferred placement when it fits', () => {
    const { anchor, menu } = setup({ left: 150, top: 100, width: 32, height: 32 }, { width: 200, height: 200 });
    expect(computeMenuPlacement(anchor, menu, false)).toEqual({ dropUp: false, alignRight: false });
  });

  it('right-aligns a menu that would overflow the right edge', () => {
    const { anchor, menu } = setup({ left: 520, top: 100, width: 32, height: 32 }, { width: 200, height: 200 });
    expect(computeMenuPlacement(anchor, menu, false).alignRight).toBe(true);
  });

  it('left-aligns a right-preferring menu that would overflow the left edge', () => {
    const { anchor, menu } = setup({ left: 110, top: 100, width: 32, height: 32 }, { width: 300, height: 200 });
    expect(computeMenuPlacement(anchor, menu, true).alignRight).toBe(false);
  });

  it('drops up when there is not enough room below but more above', () => {
    const { anchor, menu } = setup({ left: 150, top: 480, width: 32, height: 32 }, { width: 200, height: 250 });
    expect(computeMenuPlacement(anchor, menu, false).dropUp).toBe(true);
  });
});
