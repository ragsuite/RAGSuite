import { createConnectorOAuthHelpers } from '@/features/crawl/utils/connector-oauth';

const helpers = createConnectorOAuthHelpers('teams');

export const getTeamsOAuthRedirectUri = helpers.getOAuthRedirectUri;
export const coerceSavedTeamsRedirectUri = helpers.coerceSavedRedirectUri;
