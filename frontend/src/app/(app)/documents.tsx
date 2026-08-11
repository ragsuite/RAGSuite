import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy `/documents` deep link — opens crawl document tab (web redirects `/documents` → `/crawl`). */
export default function DocumentsScreen() {
  const params = useLocalSearchParams<{ segment?: string }>();
  const segment = typeof params.segment === 'string' ? params.segment : 'document';

  return (
    <Redirect
      href={{
        pathname: '/(app)/(tabs)/crawl-management',
        params: { segment },
      }}
    />
  );
}
