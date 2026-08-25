import {
  resolveChatPanelDiagonalOffset,
  resolveChatPanelShellScale,
} from '@/features/app-chat-widget/utils/chat-panel-diagonal-motion';

describe('resolveChatPanelDiagonalOffset', () => {
  it('returns right origin with positive small x/y tied to launcher size', () => {
    const offset = resolveChatPanelDiagonalOffset({
      position: 'bottom-right',
      launcherSize: 40,
    });
    expect(offset).toEqual({
      transformOrigin: 'bottom right',
      startScale: 0.16,
      startX: 10,
      startY: 10,
    });
    expect(offset.startY).toBeLessThan(40);
  });

  it('returns left origin with negative x and positive y', () => {
    expect(
      resolveChatPanelDiagonalOffset({
        position: 'bottom-left',
        launcherSize: 48,
      }),
    ).toEqual({
      transformOrigin: 'bottom left',
      startScale: 0.16,
      startX: -12,
      startY: 12,
    });
  });

  it('keeps startScale between 0 and 1', () => {
    const offset = resolveChatPanelDiagonalOffset({
      position: 'bottom-right',
      launcherSize: 38,
    });
    expect(offset.startScale).toBeGreaterThan(0);
    expect(offset.startScale).toBeLessThan(1);
  });

  it('uses launcher-sized travel, not window-height travel', () => {
    const offset = resolveChatPanelDiagonalOffset({
      position: 'bottom-right',
      launcherSize: 38,
    });
    expect(offset.startY).toBeLessThanOrEqual(38);
    expect(offset.startY).toBeGreaterThan(0);
    expect(Math.abs(offset.startX)).toBeLessThanOrEqual(38);
  });

  it('returns zero nudge when launcher size is non-positive', () => {
    expect(
      resolveChatPanelDiagonalOffset({
        position: 'bottom-right',
        launcherSize: 0,
      }),
    ).toMatchObject({ startX: 0, startY: 0, transformOrigin: 'bottom right' });
    expect(
      resolveChatPanelDiagonalOffset({
        position: 'bottom-left',
        launcherSize: -20,
      }),
    ).toMatchObject({ startX: 0, startY: 0, transformOrigin: 'bottom left' });
  });

  it('falls back to default startScale when invalid', () => {
    expect(
      resolveChatPanelDiagonalOffset({
        position: 'bottom-right',
        launcherSize: 40,
        startScale: Number.NaN,
      }).startScale,
    ).toBe(0.16);
    expect(
      resolveChatPanelDiagonalOffset({
        position: 'bottom-right',
        launcherSize: 40,
        startScale: 1.4,
      }).startScale,
    ).toBe(0.16);
  });
});

describe('resolveChatPanelShellScale', () => {
  it('maps progress 0 to start scale and 1 to full size', () => {
    expect(resolveChatPanelShellScale(0)).toBeCloseTo(0.16);
    expect(resolveChatPanelShellScale(1)).toBe(1);
  });

  it('interpolates mid progress', () => {
    expect(resolveChatPanelShellScale(0.5)).toBeCloseTo(0.16 + 0.84 * 0.5);
  });
});
