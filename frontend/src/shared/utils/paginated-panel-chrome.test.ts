import {
  createPaginatedPanelFooterWrapStyle,
  createPaginatedPanelShellStyle,
} from '@/shared/utils/paginated-panel-chrome';

describe('paginated-panel-chrome', () => {
  it('creates a single rounded shell with overflow clipping', () => {
    const style = createPaginatedPanelShellStyle({
      panelRadius: 12,
      borderColor: '#ccc',
      surfaceColor: '#fff',
      topSpacing: 24,
    });

    expect(style.borderRadius).toBe(12);
    expect(style.overflow).toBe('hidden');
    expect(style.borderWidth).toBe(1);
    expect(style.marginTop).toBe(24);
    expect(style.backgroundColor).toBe('#fff');
  });

  it('creates a footer wrap with only a top hairline separator', () => {
    const style = createPaginatedPanelFooterWrapStyle({ borderColor: '#ccc' });

    expect(style.borderTopWidth).toBeDefined();
    expect(style.borderTopColor).toBe('#ccc');
    expect(style.borderBottomLeftRadius).toBeUndefined();
    expect(style.borderBottomRightRadius).toBeUndefined();
    expect(style.borderLeftWidth).toBeUndefined();
    expect(style.borderRightWidth).toBeUndefined();
    expect(style.borderBottomWidth).toBeUndefined();
  });
});
