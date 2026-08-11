export type HeaderMetaKeys = {
  titleKey: string;
  subtitleKey?: string;
  titleParams?: Record<string, string | number>;
  subtitleParams?: Record<string, string | number>;
};

export type ResolvedHeaderMeta = {
  title: string;
  subtitle?: string;
};

export function resolveHeaderMeta(
  t: (key: string, params?: Record<string, string | number>) => string,
  meta: HeaderMetaKeys | null,
): ResolvedHeaderMeta | null {
  if (!meta) return null;
  return {
    title: t(meta.titleKey, meta.titleParams),
    subtitle: meta.subtitleKey ? t(meta.subtitleKey, meta.subtitleParams) : undefined,
  };
}
