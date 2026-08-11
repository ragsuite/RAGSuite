import { Platform } from "react-native";

import {
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
} from "@/shared/constants/layout";

/** Below this width, web uses compact (mobile-style) layouts. */
export const CRAWL_COMPACT_BREAKPOINT = 900;
export const CRAWL_HEADER_STACK_BREAKPOINT = 720;
export const CRAWL_TABLE_SCROLL_BREAKPOINT = 1280;
export const CRAWL_TABLE_MIN_WIDTH = 1040;

export const CRAWL_SOURCE_TABLE = {
  urlFlex: 2.2,
  urlMinWidth: 180,
  metricMinWidth: 76,
  actionWidth: 44,
  rowGap: 12,
} as const;

export const CRAWL_JOB_ROW = {
  identityFlex: 2,
  identityMinWidth: 180,
  statusWidth: 88,
  pagesWidth: 88,
  finishedFlex: 1.2,
  finishedMinWidth: 140,
  metricsFlex: 1.2,
  metricsMinWidth: 140,
  chevronWidth: 28,
  rowGap: 16,
} as const;

export const CRAWL_DOCUMENT_LIST = {
  checkboxColumnWidth: 40,
  iconWidth: 18,
  rowGap: 12,
  metaMinWidth: 72,
  badgesMinWidth: 120,
  tableMinWidth: 880,
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
