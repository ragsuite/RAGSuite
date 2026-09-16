import {
  getAppChatWidgetPanelMetrics,
  APP_CHAT_WIDGET_PANEL_HEIGHT_DEFAULT,
  resolveStandalonePopOutPanelSize,
} from '@/features/app-chat-widget/utils/app-chat-widget-layout';

function availableFor(
  height: number,
  insets: { top: number; bottom: number; left: number; right: number },
  options: { launcherSize: number; widgetBottomSpace: number },
) {
  const launcherOffset = options.launcherSize + 12;
  const chatWindowBottomOffset =
    launcherOffset + options.widgetBottomSpace + Math.max(insets.bottom, 12);
  const reservedTop = insets.top + 16;
  return Math.max(0, height - reservedTop - chatWindowBottomOffset);
}

describe('getAppChatWidgetPanelMetrics', () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };

  it('caps auto height at the default panel height on tall viewports', () => {
    const metrics = getAppChatWidgetPanelMetrics(1200, 1000, insets, {
      launcherSize: 38,
      widgetBottomSpace: 15,
    });
    expect(metrics.panelHeight).toBe(APP_CHAT_WIDGET_PANEL_HEIGHT_DEFAULT);
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
    const available = availableFor(500, insets, { launcherSize: 38, widgetBottomSpace: 15 });
    expect(metrics.panelHeight).toBeLessThanOrEqual(available);
    expect(metrics.panelHeight).toBe(available);
  });

  it('uses host viewport height, not a tight iframe, for auto panel height', () => {
    const host = getAppChatWidgetPanelMetrics(1440, 1000, insets, {
      launcherSize: 38,
      widgetBottomSpace: 15,
    });
    const iframeSized = getAppChatWidgetPanelMetrics(432, 400, insets, {
      launcherSize: 38,
      widgetBottomSpace: 15,
    });
    const iframeAvailable = availableFor(400, insets, {
      launcherSize: 38,
      widgetBottomSpace: 15,
    });
    expect(host.panelHeight).toBe(APP_CHAT_WIDGET_PANEL_HEIGHT_DEFAULT);
    expect(iframeSized.panelHeight).toBeLessThanOrEqual(iframeAvailable);
    expect(iframeSized.panelHeight).toBe(Math.min(iframeAvailable, Math.round(400 * 0.72)));
    expect(host.panelHeight).toBeGreaterThan(iframeSized.panelHeight);
  });

  it('never exceeds real available height on a short viewport', () => {
    const metrics = getAppChatWidgetPanelMetrics(1200, 420, insets, {
      launcherSize: 38,
      widgetBottomSpace: 15,
    });
    const available = availableFor(420, insets, { launcherSize: 38, widgetBottomSpace: 15 });
    expect(available).toBeLessThan(360);
    expect(metrics.panelHeight).toBeLessThanOrEqual(available);
    expect(metrics.panelHeight).toBeGreaterThan(0);
  });
});

describe('resolveStandalonePopOutPanelSize', () => {
  it('fills the viewport width and height', () => {
    expect(resolveStandalonePopOutPanelSize(420, 720)).toEqual({ width: 420, height: 720 });
    expect(resolveStandalonePopOutPanelSize(1200.4, 800.6)).toEqual({ width: 1200, height: 801 });
  });

  it('floors to at least 1px', () => {
    expect(resolveStandalonePopOutPanelSize(0, -10)).toEqual({ width: 1, height: 1 });
  });
});
