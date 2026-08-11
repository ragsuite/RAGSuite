import { useCallback, useEffect, useState } from 'react';

import { fetchProfile } from '@/features/profile/services/profile.service';
import type { ProfileBundle } from '@/features/profile/types/profile.types';

export function useUserProfileSummary() {
  const [profile, setProfile] = useState<ProfileBundle | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProfile(await fetchProfile());
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, loading, refresh };
}
