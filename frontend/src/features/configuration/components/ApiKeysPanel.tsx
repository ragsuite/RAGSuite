import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { KeyRound } from 'lucide-react-native';

import { ApiKeyMobileCard } from '@/features/configuration/components/ApiKeyMobileCard';
import { ApiKeyTableRow } from '@/features/configuration/components/ApiKeyTableRow';
import { ConfigurationCreateButton } from '@/features/configuration/components/configuration-actions';
import { ConfigurationPanelCard } from '@/features/configuration/components/ConfigurationPanelCard';
import { ConfigurationSkeleton } from '@/features/configuration/components/ConfigurationSkeleton';
import { CurlCommandPanel } from '@/features/configuration/components/CurlCommandPanel';
import { useConfiguration } from '@/features/configuration/hooks/useConfiguration';
import { useConfigurationLayout } from '@/features/configuration/utils/configuration-layout';
import { useTranslation } from '@/i18n';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { TableHeaderLabel } from '@/shared/components/brand';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function ApiKeysPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const {
    useCardLayout,
    useTableHorizontalScroll,
    isHeaderStacked,
    tableMinWidth,
  } = useConfigurationLayout();
  const {
    apiKeys,
    loading,
    error,
    revealedKeyIds,
    revealedSecrets,
    revealingKeyId,
    toggleRevealKey,
    openSheet,
    notify,
    reload,
  } = useConfiguration();

  const showSkeleton = loading && apiKeys.length === 0;
  const listIsEmpty = !loading && !error && apiKeys.length === 0;

  const createButton = (
    <ConfigurationCreateButton
      label={t('api-keys.create')}
      onPress={() => openSheet({ type: 'create' })}
      fullWidth={isHeaderStacked}
    />
  );

  const tableHeaders = [
    { key: 'name', label: t('api-keys.name') },
    { key: 'key', label: t('api-keys.key') },
    { key: 'created', label: t('api-keys.created') },
    { key: 'lastUsed', label: t('api-keys.lastUsed') },
    { key: 'requests', label: t('api-keys.requests') },
    { key: 'actions', label: t('api-keys.actions') },
  ] as const;

  const headerRow = (
    <View
      style={[
        styles.tableHeader,
        {
          borderTopColor: colors.border,
          borderBottomColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingVertical: isWebParitySurfaces ? 0 : spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: isWebParitySurfaces ? 48 : undefined,
        },
      ]}>
      {tableHeaders.map(({ key, label }) => (
        <TableHeaderLabel
          key={key}
          style={[
            styles.headerCell,
            key === 'name' ? styles.nameHeader : null,
            key === 'key' ? styles.keyHeader : null,
            key === 'actions' ? styles.actionsHeader : null,
          ]}>
          {label}
        </TableHeaderLabel>
      ))}
    </View>
  );

  const tableBody =
    listIsEmpty && !useCardLayout ? (
      <EmptyStateView title={t('api-keys.empty.title')} description={t('api-keys.empty.description')} variant="inline" />
    ) : (
      apiKeys.map((key, index) => (
        <ApiKeyTableRow
          key={key.id}
          apiKey={key}
          revealed={revealedKeyIds.has(key.id)}
          revealedSecret={revealedSecrets[key.id]}
          revealing={revealingKeyId === key.id}
          isLast={index === apiKeys.length - 1}
          onToggleReveal={() => void toggleRevealKey(key.id)}
          onDelete={() => openSheet({ type: 'confirm-delete', keyId: key.id })}
          onCopyFeedback={notify}
        />
      ))
    );

  const renderTable = () => {
    const table = (
      <View style={useTableHorizontalScroll ? { minWidth: tableMinWidth } : undefined}>
        {headerRow}
        {tableBody}
      </View>
    );

    if (useTableHorizontalScroll) {
      return (
        <AppScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.tableScrollContent}>
          {table}
        </AppScrollView>
      );
    }

    return table;
  };

  const renderList = () => {
    if (showSkeleton) {
      return (
        <View style={{ padding: spacing.md }}>
          <ConfigurationSkeleton rows={3} />
        </View>
      );
    }

    if (listIsEmpty && useCardLayout) {
      return (
        <EmptyStateView
          title={t('api-keys.empty.title')}
          description={t('api-keys.empty.description')}
          icon={KeyRound}
          variant="inline"
        />
      );
    }

    if (listIsEmpty) {
      return renderTable();
    }

    if (useCardLayout) {
      return (
        <View style={{ gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          {apiKeys.map((key) => (
            <ApiKeyMobileCard
              key={key.id}
              apiKey={key}
              revealed={revealedKeyIds.has(key.id)}
              revealedSecret={revealedSecrets[key.id]}
              revealing={revealingKeyId === key.id}
              onToggleReveal={() => void toggleRevealKey(key.id)}
              onDelete={() => openSheet({ type: 'confirm-delete', keyId: key.id })}
              onCopyFeedback={notify}
            />
          ))}
        </View>
      );
    }

    return renderTable();
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <ConfigurationPanelCard
        icon={KeyRound}
        title={t('api-keys.title')}
        subtitle={t('api-keys.description')}
        headerAction={createButton}>
        {error && apiKeys.length === 0 ? (
          <View>
            <StatePanel error={error} onRetry={() => void reload()}>
              {null}
            </StatePanel>
          </View>
        ) : (
          <View style={useCardLayout ? undefined : { marginHorizontal: -spacing.md, marginTop: -spacing.md }}>
            {renderList()}
          </View>
        )}
      </ConfigurationPanelCard>

      <CurlCommandPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  tableScrollContent: {
    flexGrow: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  headerCell: {
    flex: 1,
    minWidth: 0,
  },
  nameHeader: {
    flex: 1.1,
    minWidth: 88,
  },
  keyHeader: {
    flex: 2.3,
    minWidth: 200,
  },
  actionsHeader: {
    flex: 0.4,
    minWidth: 56,
    textAlign: 'right',
  },
});
