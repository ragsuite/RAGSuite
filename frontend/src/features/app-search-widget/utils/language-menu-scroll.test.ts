import { languageMenuConsumesWheel } from '@/features/app-search-widget/utils/language-menu-scroll';

describe('languageMenuConsumesWheel', () => {
  it('lets the page scroll when every option already fits', () => {
    expect(
      languageMenuConsumesWheel({
        scrollHeight: 200,
        clientHeight: 200,
        scrollTop: 0,
        deltaY: 40,
      }),
    ).toBe(false);
  });

  it('scrolls the menu when more options are in the wheel direction', () => {
    expect(
      languageMenuConsumesWheel({
        scrollHeight: 400,
        clientHeight: 180,
        scrollTop: 20,
        deltaY: 40,
      }),
    ).toBe(true);
    expect(
      languageMenuConsumesWheel({
        scrollHeight: 400,
        clientHeight: 180,
        scrollTop: 20,
        deltaY: -12,
      }),
    ).toBe(true);
  });

  it('releases the wheel at the menu edges', () => {
    expect(
      languageMenuConsumesWheel({
        scrollHeight: 400,
        clientHeight: 180,
        scrollTop: 0,
        deltaY: -30,
      }),
    ).toBe(false);
    expect(
      languageMenuConsumesWheel({
        scrollHeight: 400,
        clientHeight: 180,
        scrollTop: 220,
        deltaY: 30,
      }),
    ).toBe(false);
  });
});
