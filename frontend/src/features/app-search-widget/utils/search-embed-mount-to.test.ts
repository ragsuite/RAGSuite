import {
  resolveSearchMountTarget,
  shouldRelocateIframe,
} from '@/features/app-search-widget/utils/search-embed-mount-to';

describe('search embed mountTo helpers', () => {
  const safe = (el: Element | null) => !!el && el.id !== 'unsafe';

  it('resolves a safe selector', () => {
    const slot = { id: 'slot' } as unknown as Element;
    expect(
      resolveSearchMountTarget('#slot', (sel) => (sel === '#slot' ? slot : null), safe),
    ).toBe(slot);
  });

  it('rejects missing or unsafe targets', () => {
    expect(resolveSearchMountTarget('', () => null, safe)).toBeNull();
    const unsafe = { id: 'unsafe' } as unknown as Element;
    expect(
      resolveSearchMountTarget('#x', () => unsafe, safe),
    ).toBeNull();
  });

  it('detects no-op when already mounted', () => {
    const parent = {} as Element;
    expect(shouldRelocateIframe({ parentNode: parent }, parent)).toBe(false);
    expect(shouldRelocateIframe({ parentNode: null }, parent)).toBe(true);
  });
});
