type AppState = {
  initialized: boolean;
};

const state: AppState = {
  initialized: true,
};

export function getAppState() {
  return state;
}
