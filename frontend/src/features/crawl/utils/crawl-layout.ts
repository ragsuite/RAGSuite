import { Platform } from "react-native";

import {
  COMPACT_LAYOUT_BREAKPOINT,
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
  HEADER_STACK_BREAKPOINT,
  TABLE_SCROLL_BREAKPOINT,
} from "@/shared/constants/layout";

/** Below this width, web uses compact (mobile-style) layouts. */
export const CRAWL_COMPACT_BREAKPOINT = COMPACT_LAYOUT_BREAKPOINT;
export const CRAWL_HEADER_STACK_BREAKPOINT = HEADER_STACK_BREAKPOINT;
export const CRAWL_TABLE_SCROLL_BREAKPOINT = Math.max(TABLE_SCROLL_BREAKPOINT, 1280);
/** Sum of fixed columns + mins; horizontal scroll below this. */
export const CRAWL_TABLE_MIN_WIDTH = 1270;

/**
 * Sources table: flexible columns share leftover width so headers stay over
 * values without a dead gap before the action menu.
 */
export const CRAWL_SOURCE_TABLE = {
  urlFlex: 1.6,
  urlMinWidth: 160,
  modelFlex: 1.1,
  modelMinWidth: 110,
  /** Schedule on top, "Depth · Wait for load" caption below. */
  crawlFlex: 1,
  crawlMinWidth: 128,
  /** Fits a one-line in-progress badge ("Reading pages") plus its progress track. */
  statusWidth: 132,
  trainingFlex: 0.9,
  trainingMinWidth: 96,
  linksWidth: 48,
  /** "In answers" switch plus the lock hint icon. */
  answersWidth: 80,
  actionWidth: 36,
  rowGap: 10,
  /** Total minimum stays under ~890px so a 1400px window shows every column without scrolling. */
  edgePadding: 12,
} as const;

const SOURCE_COLUMN_MIN_WIDTHS = [
  CRAWL_SOURCE_TABLE.urlMinWidth,
  CRAWL_SOURCE_TABLE.modelMinWidth,
  CRAWL_SOURCE_TABLE.crawlMinWidth,
  CRAWL_SOURCE_TABLE.statusWidth,
  CRAWL_SOURCE_TABLE.trainingMinWidth,
  CRAWL_SOURCE_TABLE.linksWidth,
  CRAWL_SOURCE_TABLE.answersWidth,
  CRAWL_SOURCE_TABLE.actionWidth,
];

/** Below this measured width the sources table scrolls instead of squeezing cells. */
export const CRAWL_SOURCES_TABLE_MIN_WIDTH =
  SOURCE_COLUMN_MIN_WIDTHS.reduce((total, width) => total + width, 0) +
  (SOURCE_COLUMN_MIN_WIDTHS.length - 1) * CRAWL_SOURCE_TABLE.rowGap +
  CRAWL_SOURCE_TABLE.edgePadding * 2;
/** Pressable cell group (everything before "In answers" and the menu) never squeezes below its columns. */
export const CRAWL_SOURCES_ROW_MAIN_MIN_WIDTH =
  CRAWL_SOURCES_TABLE_MIN_WIDTH -
  CRAWL_SOURCE_TABLE.edgePadding * 2 -
  CRAWL_SOURCE_TABLE.answersWidth -
  CRAWL_SOURCE_TABLE.actionWidth -
  CRAWL_SOURCE_TABLE.rowGap * 2;
export const CRAWL_SOURCES_TABLE_SCROLL_BREAKPOINT = Math.max(
  CRAWL_TABLE_SCROLL_BREAKPOINT,
  CRAWL_SOURCES_TABLE_MIN_WIDTH + 32,
);

export const CRAWL_JOB_ROW = {
  /** Cap growth so STATUS/LINKS/LAST CRAWL are not pushed into a right cluster. */
  identityFlex: 1.2,
  identityMinWidth: 200,
  identityMaxWidth: 320,
  /** Fits status chip + in-flight spinner without spilling into LINKS. */
  statusWidth: 132,
  pagesFlex: 1.15,
  pagesMinWidth: 200,
  finishedFlex: 1.15,
  finishedMinWidth: 168,
  chevronWidth: 32,
  rowGap: 20,
} as const;

export const CRAWL_DOCUMENT_LIST = {
  checkboxColumnWidth: 40,
  iconWidth: 18,
  rowGap: 12,
  metaMinWidth: 72,
  badgesMinWidth: 120,
  answersWidth: 96,
  tableMinWidth: 980,
} as const;

export function isCrawlWebPlatform(): boolean {
  return Platform.OS === "web";
}

export function isCrawlCompactWidth(width: number): boolean {
  return width < CRAWL_COMPACT_BREAKPOINT;
}

export function getCrawlContentMaxWidth(width: number): number {
  return getFeatureContentMaxWidth(width);
}

export function getCrawlHorizontalPadding(width: number): number {
  return getFeatureHorizontalPadding(width);
}
