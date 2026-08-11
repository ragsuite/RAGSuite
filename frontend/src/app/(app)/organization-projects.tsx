import { Redirect } from 'expo-router';

import { hrefForAppRoute } from '@/config/navigation';

export default function OrganizationProjectsRoute() {
  return <Redirect href={hrefForAppRoute('projects')} />;
}
