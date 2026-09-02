import {
  createPaginatedPanelFooterShellStyle,
  createPaginatedPanelFrameStyle,
} from '@/shared/components/paginated-panel-styles';

describe('paginated-panel-styles', () => {
  const base = {
    panelRadius: 12,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  };

  it('keeps bottom corner radius on open panels with a footer', () => {
    const open = createPaginatedPanelFrameStyle({ ...base, tableClosed: false });
    expect(open.borderBottomLeftRadius).toBe(12);
    expect(open.borderBottomRightRadius).toBe(12);
    expect(open.borderBottomWidth).toBe(0);
  });

  it('keeps bottom corner radius on closed empty panels', () => {
    const closed = createPaginatedPanelFrameStyle({ ...base, tableClosed: true });
    expect(closed.borderBottomLeftRadius).toBe(12);
    expect(closed.borderBottomRightRadius).toBe(12);
    expect(closed.borderBottomWidth).toBe(1);
  });

  it('applies matching radius on footer shell', () => {
    const footer = createPaginatedPanelFooterShellStyle(base);
    expect(footer.borderBottomLeftRadius).toBe(12);
    expect(footer.borderBottomRightRadius).toBe(12);
    expect(footer.overflow).toBe('hidden');
  });
});
