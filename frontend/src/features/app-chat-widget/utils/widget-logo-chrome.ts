import type { ImageStyle, ViewStyle } from 'react-native';

export type WidgetLogoChromeSurface = 'home' | 'header' | 'adminPreview';

export type WidgetLogoShape = 'circle' | 'flexible';

export type WidgetLogoChromeOptions = {
  logoShape?: WidgetLogoShape | null;
  logoBorderRadius?: number | null;
};

export type WidgetLogoChrome = {
  /** True when a custom uploaded logo URL is present. */
  isCustom: boolean;
  /** True when custom logo uses aspect-flexible soft-corner chrome. */
  isFlexible: boolean;
  container: ViewStyle;
  image: ImageStyle;
  /** expo-image / RN Image contentFit for the logo bitmap. */
  contentFit: 'contain' | 'cover';
};

export type WidgetLogoBoxSize = {
  width: number;
  height: number;
};

export type WidgetLogoMaxBox = {
  maxWidth: number;
  maxHeight: number;
};

const HOME_CIRCLE = 36;
const HEADER_CIRCLE = 24;
const ADMIN_CIRCLE = 30;

const DEFAULT_SOFT_RADIUS = 8;
const MAX_SOFT_RADIUS = 20;

const SURFACE_MAX_BOX: Record<WidgetLogoChromeSurface, WidgetLogoMaxBox> = {
  home: { maxWidth: 120, maxHeight: HOME_CIRCLE },
  header: { maxWidth: 96, maxHeight: HEADER_CIRCLE },
  adminPreview: { maxWidth: 120, maxHeight: ADMIN_CIRCLE },
};

const SURFACE_CIRCLE: Record<WidgetLogoChromeSurface, number> = {
  home: HOME_CIRCLE,
  header: HEADER_CIRCLE,
  adminPreview: ADMIN_CIRCLE,
};

/**
 * Per-surface max box for custom EE logos (contain-fit target).
 */
export function getWidgetLogoMaxBox(
  surface: WidgetLogoChromeSurface,
): WidgetLogoMaxBox {
  return SURFACE_MAX_BOX[surface];
}

/**
 * Square fallback before intrinsic size is known (or on measure failure).
 */
export function getWidgetLogoFallbackSize(
  surface: WidgetLogoChromeSurface,
): WidgetLogoBoxSize {
  const { maxHeight } = getWidgetLogoMaxBox(surface);
  return { width: maxHeight, height: maxHeight };
}

export function clampLogoBorderRadius(value: number | null | undefined): number {
  const raw = Number.isFinite(value as number)
    ? Number(value)
    : DEFAULT_SOFT_RADIUS;
  return Math.max(0, Math.min(MAX_SOFT_RADIUS, Math.round(raw)));
}

export function resolveLogoShape(
  shape: WidgetLogoShape | null | undefined,
): WidgetLogoShape {
  return shape === 'flexible' ? 'flexible' : 'circle';
}

/**
 * Contain-fit natural image size into a max box, preserving aspect ratio.
 */
export function fitLogoBox(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
): WidgetLogoBoxSize {
  const natW = Number.isFinite(naturalWidth) ? naturalWidth : 0;
  const natH = Number.isFinite(naturalHeight) ? naturalHeight : 0;
  if (natW <= 0 || natH <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return {
      width: Math.max(0, maxHeight),
      height: Math.max(0, maxHeight),
    };
  }

  const aspect = natW / natH;
  const boxAspect = maxWidth / maxHeight;

  if (boxAspect > aspect) {
    const height = maxHeight;
    return { width: height * aspect, height };
  }

  const width = maxWidth;
  return { width, height: width / aspect };
}

function circleChrome(
  surface: WidgetLogoChromeSurface,
  isCustom: boolean,
): WidgetLogoChrome {
  const size = SURFACE_CIRCLE[surface];
  // Admin default mark uses soft radius historically; custom circle still full pill.
  const borderRadius =
    !isCustom && surface === 'adminPreview' ? DEFAULT_SOFT_RADIUS : size / 2;
  return {
    isCustom,
    isFlexible: false,
    contentFit: 'cover',
    container: {
      width: size,
      height: size,
      borderRadius,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    image: {
      width: size,
      height: size,
      borderRadius,
    },
  };
}

function flexibleChrome(
  surface: WidgetLogoChromeSurface,
  logoBorderRadius: number,
): WidgetLogoChrome {
  const maxBox = getWidgetLogoMaxBox(surface);
  const radius = clampLogoBorderRadius(logoBorderRadius);
  return {
    isCustom: true,
    isFlexible: true,
    contentFit: 'contain',
    container: {
      borderRadius: radius,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      maxWidth: maxBox.maxWidth,
      maxHeight: maxBox.maxHeight,
    },
    image: {
      borderRadius: radius,
    },
  };
}

/**
 * Logo chrome for chat widget brand mark.
 * - No custom URL: fixed circular (or admin soft) badge.
 * - Custom + circle: fixed circular crop (cover).
 * - Custom + flexible: soft corners + contain; size applied by caller via fit.
 */
export function resolveWidgetLogoChrome(
  logoUrl: string | null | undefined,
  surface: WidgetLogoChromeSurface,
  options?: WidgetLogoChromeOptions,
): WidgetLogoChrome {
  const isCustom = Boolean((logoUrl || '').trim());
  if (!isCustom) {
    return circleChrome(surface, false);
  }

  const shape = resolveLogoShape(options?.logoShape);
  if (shape === 'flexible') {
    return flexibleChrome(
      surface,
      options?.logoBorderRadius ?? DEFAULT_SOFT_RADIUS,
    );
  }

  return circleChrome(surface, true);
}
