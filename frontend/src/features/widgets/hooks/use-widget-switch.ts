import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { hrefForAppRoute } from '@/config/navigation';
import { WIDGET_TABS, type WidgetRoute, type WidgetTabMeta } from '@/config/widgets-navigation';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';

/** Widgets switcher: visible tabs for the current user and a switch that restarts the target's UI. */
export function useWidgetSwitch(active: WidgetRoute) {
  const router = useRouter();
  const { canAccessRoute } = useActiveProject();
  const { resetNavigation: resetChatbotNavigation } = useChatbotConfig();
  const { resetNavigation: resetSearchNavigation } = useSearchConfig();

  const tabs = useMemo<WidgetTabMeta[]>(
    () => WIDGET_TABS.filter((tab) => tab.route === active || canAccessRoute(tab.route)),
    [active, canAccessRoute],
  );

  const switchTo = useCallback(
    (target: WidgetRoute) => {
      if (target === active) return;
      if (target === 'chatbot-config') resetChatbotNavigation();
      else resetSearchNavigation();
      router.navigate(hrefForAppRoute(target));
    },
    [active, resetChatbotNavigation, resetSearchNavigation, router],
  );

  return { tabs, switchTo };
}
