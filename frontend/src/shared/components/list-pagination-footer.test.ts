import {
  activePageNumberColor,
  circularButtonRadius,
  paginationFooterBarStyle,
} from '@/shared/components/list-pagination-footer.utils';
import { VISIBLE_PAGE_BUTTON_COUNT } from '@/shared/constants/pagination';
import { colors } from '@/theme/colors';

describe('list-pagination-footer utils', () => {
  it('uses a single-row bar layout without wrapping', () => {
    expect(paginationFooterBarStyle.bar.flexDirection).toBe('row');
    expect(paginationFooterBarStyle.bar.flexWrap).toBe('nowrap');
  });

  it('uses textOnPrimary for the active page number', () => {
    const palette = colors.light;
    expect(activePageNumberColor(true, palette)).toBe(palette.textOnPrimary);
    expect(activePageNumberColor(false, palette)).toBe(palette.text);
  });

  it('uses a fixed visible page button count of 5', () => {
    expect(VISIBLE_PAGE_BUTTON_COUNT).toBe(5);
  });

  it('renders circular pagination controls', () => {
    expect(circularButtonRadius(36)).toBe(18);
    expect(circularButtonRadius(32)).toBe(16);
  });
});
