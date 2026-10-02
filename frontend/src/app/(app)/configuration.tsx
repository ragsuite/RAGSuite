import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';

/**
 * Legacy Integrations (/configuration) redirects to MCP Connect.
 * Bookmarks and notifications keep working without a 404.
 */
export default function ConfigurationRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(app)/mcp');
  }, [router]);

  return null;
}
