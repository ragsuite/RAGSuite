import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { AuditLogEventDetailScreen } from '@/features/audit-logs/screens/AuditLogEventDetailScreen';

export default function AuditLogEventDetailRoute() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = typeof eventId === 'string' ? decodeURIComponent(eventId) : '';

  if (!id) {
    return null;
  }

  return <AuditLogEventDetailScreen eventId={id} />;
}
