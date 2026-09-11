import { Redirect } from 'expo-router';

/** Legacy training Search History → main History module (Search tab). */
export default function SearchTrainingHistoryRouteRedirect() {
  return <Redirect href="/(app)/history?kind=search" />;
}
