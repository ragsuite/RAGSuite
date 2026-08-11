import React, { createContext, useContext, useMemo, useState } from 'react';

type AppShellContextValue = {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  isNotificationsPanelOpen: boolean;
  openNotificationsPanel: () => void;
  closeNotificationsPanel: () => void;
  toggleNotificationsPanel: () => void;
  isNotificationsFiltersOpen: boolean;
  toggleNotificationsFilters: () => void;
  closeNotificationsFilters: () => void;
  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function AppShellProvider({ children }: Props) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isNotificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [isNotificationsFiltersOpen, setNotificationsFiltersOpen] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isHelpOpen, setHelpOpen] = useState(false);

  const value = useMemo(
    () => ({
      isSidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((prev) => !prev),
      setSidebarCollapsed,
      isNotificationsPanelOpen,
      openNotificationsPanel: () => setNotificationsPanelOpen(true),
      closeNotificationsPanel: () => setNotificationsPanelOpen(false),
      toggleNotificationsPanel: () => setNotificationsPanelOpen((prev) => !prev),
      isNotificationsFiltersOpen,
      toggleNotificationsFilters: () => setNotificationsFiltersOpen((prev) => !prev),
      closeNotificationsFilters: () => setNotificationsFiltersOpen(false),
      isCommandPaletteOpen,
      openCommandPalette: () => setCommandPaletteOpen(true),
      closeCommandPalette: () => setCommandPaletteOpen(false),
      toggleCommandPalette: () => setCommandPaletteOpen((prev) => !prev),
      isHelpOpen,
      openHelp: () => setHelpOpen(true),
      closeHelp: () => setHelpOpen(false),
    }),
    [isSidebarCollapsed, isNotificationsPanelOpen, isNotificationsFiltersOpen, isCommandPaletteOpen, isHelpOpen],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useOptionalAppShell(): AppShellContextValue | null {
  return useContext(AppShellContext);
}

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell must be used inside AppShellProvider');
  }
  return context;
}
