import { StyleSheet } from 'react-native';

/** Pagination bar — row by default; callers may override wrap via stacked style. */
export const paginationFooterBarStyle = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    width: '100%',
  },
  barStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    flexWrap: 'nowrap',
  },
});

type FooterColors = {
  text: string;
  textOnPrimary: string;
};

/** Active page numbers sit on primary fill — must use textOnPrimary for contrast. */
export function activePageNumberColor(active: boolean, colors: FooterColors): string {
  return active ? colors.textOnPrimary : colors.text;
}

/** Circular pagination control radius for a square button size. */
export function circularButtonRadius(size: number): number {
  return size / 2;
}
