import { Redirect } from 'expo-router';

/** Legacy drawer path — unified Overview lives on the Home tab. */
export default function AnalyticsRoute() {
  return <Redirect href="/(app)/(tabs)" />;
}
