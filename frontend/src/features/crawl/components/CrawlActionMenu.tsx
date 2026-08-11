import { ActionIcons } from '@/shared/constants/action-icons';
import { Play } from 'lucide-react-native';
import React from 'react';

import {
  AdaptiveActionMenu,
  type AdaptiveMenuItem,
  type MenuAnchor,
} from '@/shared/components/adaptive/adaptive-action-menu';

export type CrawlMenuItem = AdaptiveMenuItem;
export type { MenuAnchor };

type Props = {
  visible: boolean;
  title?: string;
  items: CrawlMenuItem[];
  onClose: () => void;
  anchor?: MenuAnchor | null;
};

export function CrawlActionMenu({ visible, title, items, onClose, anchor }: Props) {
  return (
    <AdaptiveActionMenu
      visible={visible}
      title={title}
      items={items}
      onClose={onClose}
      anchor={anchor}
    />
  );
}

export function sourceMenuItems(
  t: (key: string) => string,
  handlers: {
    onRun: () => void;
    onEdit: () => void;
    onDelete: () => void;
    canStartCrawl?: boolean;
    startDisabledReason?: string;
  },
): CrawlMenuItem[] {
  const startDisabled = handlers.canStartCrawl === false;
  return [
    {
      key: 'run',
      label: t('crawl.start'),
      icon: Play,
      disabled: startDisabled,
      onPress: handlers.onRun,
    },
    { key: 'edit', label: t('common.edit'), icon: ActionIcons.edit, onPress: handlers.onEdit },
    { key: 'delete', label: t('common.delete'), icon: ActionIcons.delete, tone: 'danger', onPress: handlers.onDelete },
  ];
}
