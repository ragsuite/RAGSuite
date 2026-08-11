import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { FeedbackDetailScreen } from '@/features/feedback-moderation/screens/FeedbackDetailScreen';

export default function FeedbackDetailRoute() {
  const { feedbackId } = useLocalSearchParams<{ feedbackId: string }>();
  if (!feedbackId || typeof feedbackId !== 'string') return null;
  return <FeedbackDetailScreen feedbackId={feedbackId} />;
}
