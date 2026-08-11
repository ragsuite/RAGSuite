import { createConnectorOAuthHelpers } from '@/features/crawl/utils/connector-oauth';

const helpers = createConnectorOAuthHelpers('confluence');

export const getConfluenceOAuthRedirectUri = helpers.getOAuthRedirectUri;
export const coerceSavedConfluenceRedirectUri = helpers.coerceSavedRedirectUri;
