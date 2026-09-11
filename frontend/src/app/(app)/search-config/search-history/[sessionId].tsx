import { Redirect } from 'expo-router';

/** Legacy training Search History session → main History module (Search tab). */
export default function SearchTrainingHistorySessionRouteRedirect() {
  return <Redirect href="/(app)/history?kind=search" />;
}
