import {
  measureFittedLogoSize,
  readLogoLoadSource,
} from '@/features/app-chat-widget/hooks/use-widget-logo-fit';

describe('measureFittedLogoSize', () => {
  it('fits wide logos into the home max box', () => {
    expect(measureFittedLogoSize(300, 100, 'home')).toEqual({
      width: 108,
      height: 36,
    });
  });

  it('fits tall logos into the header max box', () => {
    expect(measureFittedLogoSize(50, 100, 'header')).toEqual({
      width: 12,
      height: 24,
    });
  });

  it('returns null for invalid dimensions', () => {
    expect(measureFittedLogoSize(0, 100, 'home')).toBeNull();
    expect(measureFittedLogoSize(100, -1, 'home')).toBeNull();
  });
});

describe('readLogoLoadSource', () => {
  it('reads direct expo-image load payload and RN nativeEvent', () => {
    expect(
      readLogoLoadSource({ source: { width: 300, height: 100 } }),
    ).toEqual({ width: 300, height: 100 });
    expect(
      readLogoLoadSource({
        nativeEvent: { source: { width: 50, height: 50 } },
      }),
    ).toEqual({ width: 50, height: 50 });
    expect(readLogoLoadSource(null)).toBeNull();
  });
});
