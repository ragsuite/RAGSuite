import React from 'react';
import { Platform } from 'react-native';

import { CommandPaletteSheet } from '@/shared/components/shell/command-palette-sheet';
import { HelpSystemModal } from '@/shared/components/shell/help-system-modal';
import { OnboardingTourModal } from '@/shared/components/shell/onboarding-tour-modal';
import { useAppShell } from '@/shared/components/navigation/app-shell-provider';
import { useShellOnboardingTour } from '@/shared/hooks/use-shell-onboarding-tour';

/** Global shell overlays: command palette, help, onboarding tour. */
export function AppShellOverlays() {
  const {
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    isHelpOpen,
    closeHelp,
  } = useAppShell();
  const { isTourActive, completeTour, skipTour } = useShellOnboardingTour();

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isCommandPaletteOpen) {
          closeCommandPalette();
        } else {
          openCommandPalette();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeCommandPalette, isCommandPaletteOpen, openCommandPalette]);

  return (
    <>
      <CommandPaletteSheet visible={isCommandPaletteOpen} onClose={closeCommandPalette} />
      <HelpSystemModal visible={isHelpOpen} onClose={closeHelp} />
      <OnboardingTourModal visible={isTourActive} onComplete={() => void completeTour()} onSkip={() => void skipTour()} />
    </>
  );
}
