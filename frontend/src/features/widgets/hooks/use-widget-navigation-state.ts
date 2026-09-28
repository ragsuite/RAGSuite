import { useCallback, useReducer } from 'react';

export type WidgetNavigationDefaults<P extends string, T extends string, S extends string> = {
  primaryTab: P;
  trainingSubTab: T;
  settingsSection: S;
};

type WidgetNavigationValues<P extends string, T extends string, S extends string> = WidgetNavigationDefaults<
  P,
  T,
  S
> & {
  /** Bumped by reset; screens key their content on it to drop panel-local UI state. */
  navigationKey: number;
};

export type WidgetNavigationAction<P extends string, T extends string, S extends string> =
  | { type: 'primaryTab'; value: P }
  | { type: 'trainingSubTab'; value: T }
  | { type: 'settingsSection'; value: S }
  | { type: 'reset'; defaults: WidgetNavigationDefaults<P, T, S> };

export function widgetNavigationReducer<P extends string, T extends string, S extends string>(
  state: WidgetNavigationValues<P, T, S>,
  action: WidgetNavigationAction<P, T, S>,
): WidgetNavigationValues<P, T, S> {
  switch (action.type) {
    case 'primaryTab':
      return state.primaryTab === action.value ? state : { ...state, primaryTab: action.value };
    case 'trainingSubTab':
      return state.trainingSubTab === action.value ? state : { ...state, trainingSubTab: action.value };
    case 'settingsSection':
      return state.settingsSection === action.value ? state : { ...state, settingsSection: action.value };
    case 'reset':
      return { ...action.defaults, navigationKey: state.navigationKey + 1 };
  }
}

export type WidgetNavigationState<P extends string, T extends string, S extends string> = WidgetNavigationValues<
  P,
  T,
  S
> & {
  setPrimaryTab: (tab: P) => void;
  setTrainingSubTab: (tab: T) => void;
  setSettingsSection: (section: S) => void;
  /** Return tabs, sub-tabs and scroll to their starting position; configuration data is untouched. */
  resetNavigation: () => void;
};

/** UI-only tab state shared by the Chatbot and Search widget providers. */
export function useWidgetNavigationState<P extends string, T extends string, S extends string>(
  defaults: WidgetNavigationDefaults<P, T, S>,
): WidgetNavigationState<P, T, S> {
  const [state, dispatch] = useReducer(
    widgetNavigationReducer<P, T, S>,
    defaults,
    (initial): WidgetNavigationValues<P, T, S> => ({ ...initial, navigationKey: 0 }),
  );

  const setPrimaryTab = useCallback((value: P) => dispatch({ type: 'primaryTab', value }), []);
  const setTrainingSubTab = useCallback((value: T) => dispatch({ type: 'trainingSubTab', value }), []);
  const setSettingsSection = useCallback((value: S) => dispatch({ type: 'settingsSection', value }), []);
  const resetNavigation = useCallback(() => dispatch({ type: 'reset', defaults }), [defaults]);

  return { ...state, setPrimaryTab, setTrainingSubTab, setSettingsSection, resetNavigation };
}
