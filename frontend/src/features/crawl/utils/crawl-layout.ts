import { Platform } from "react-native";

import {
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
} from "@/shared/constants/layout";

/** Below this width, web uses compact (mobile-style) layouts. */
export const CRAWL_COMPACT_BREAKPOINT = 900;
export const CRAWL_HEADER_STACK_BREAKPOINT = 720;
export const CRAWL_TABLE_SCROLL_BREAKPOINT = 1280;
/** Sum of fixed columns + mins; horizontal scroll below this. */
export const CRAWL_TABLE_MIN_WIDTH = 1220;

/**
 * Sources table: flexible columns share leftover width so headers stay over
 * values without a dead gap before the action menu.
 */
export const CRAWL_SOURCE_TABLE = {
  urlFlex: 1.6,
  urlMinWidth: 200,
  modelFlex: 1.1,
  modelMinWidth: 150,
  depthWidth: 64,
  cadenceWidth: 80,
  /** Wide enough for "HEADLESS MODE" on one line. */
  headlessWidth: 124,
  statusWidth: 88,
  trainingFlex: 0.9,
  trainingMinWidth: 104,
  lastCrawlFlex: 0.9,
  lastCrawlMinWidth: 104,
  linksWidth: 72,
  actionWidth: 44,
  rowGap: 12,
} as const;

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
