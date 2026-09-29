import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MessageSquare, Search } from 'lucide-react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { SurfaceTuningFields } from '@/features/model-configuration/components/SurfaceTuningFields';
import type {
  ModelProviderKey,
  SurfaceTuningDraft,
  TuningSurface,
} from '@/features/model-configuration/types/model-configuration.types';
import { TUNING_SURFACES } from '@/features/model-configuration/utils/provider-surface-tuning';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  provider: ModelProviderKey;
  providerLabel: string;
  value: Record<TuningSurface, SurfaceTuningDraft>;
  onChange: (surface: TuningSurface, patch: Partial<SurfaceTuningDraft>) => void;
};

const SURFACE_ICONS: Record<TuningSurface, typeof MessageSquare> = { chat: MessageSquare, search: Search };

/** Chatbot and Search tuning kept with this provider's models, one sub-tab per surface. */
export function ProviderSurfaceTuningFields({ provider, providerLabel, value, onChange }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const [activeSurface, setActiveSurface] = useState<TuningSurface>('chat');

  const tabs = useMemo(
    () =>
      TUNING_SURFACES.map((surface) => ({
        key: surface,
        label: t(`modelConfiguration.tuning.${surface}.title`),
        icon: SURFACE_ICONS[surface],
      })),
    [t],
  );

  return (
    <View style={{ gap: spacing.md }}>
      <CrawlSegmentTabs
        tabs={tabs}
        activeTab={activeSurface}
        onChange={setActiveSurface}
        variant="secondary"
        appearance="pill"
      />
      <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>
        {t(`modelConfiguration.tuning.${activeSurface}.hint`, { provider: providerLabel })}
      </Text>
      <SurfaceTuningFields
        provider={provider}
        surface={activeSurface}
        value={value[activeSurface]}
        onChange={(patch) => onChange(activeSurface, patch)}
        maxTokensHelper={t(`modelConfiguration.tuning.${activeSurface}.maxTokensHelper`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { lineHeight: 18 },
});
