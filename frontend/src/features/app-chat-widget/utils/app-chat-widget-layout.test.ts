import { getAppChatWidgetPanelMetrics } from '@/features/app-chat-widget/utils/app-chat-widget-layout';

describe('getAppChatWidgetPanelMetrics', () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };

  it('caps auto height below full viewport', () => {
    const metrics = getAppChatWidgetPanelMetrics(1200, 1000, insets, {
      launcherSize: 38,
      widgetBottomSpace: 15,
    });
    expect(metrics.panelHeight).toBeLessThanOrEqual(Math.round(1000 * 0.72));
    expect(metrics.panelHeight).toBeGreaterThanOrEqual(360);
  });

  it('honors custom height when enabled', () => {
    const metrics = getAppChatWidgetPanelMetrics(1200, 1000, insets, {
      customHeight: { enabled: true, height: 600 },
      launcherSize: 38,
      widgetBottomSpace: 15,
    });
    expect(metrics.panelHeight).toBe(600);
  });

  it('clamps custom height to available viewport', () => {
    const metrics = getAppChatWidgetPanelMetrics(1200, 500, insets, {
      customHeight: { enabled: true, height: 800 },
      launcherSize: 38,
      widgetBottomSpace: 15,
    });
    expect(metrics.panelHeight).toBeLessThanOrEqual(500);
  });
});
