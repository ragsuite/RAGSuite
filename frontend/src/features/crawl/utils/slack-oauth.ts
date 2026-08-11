import { createConnectorOAuthHelpers } from '@/features/crawl/utils/connector-oauth';

const helpers = createConnectorOAuthHelpers('slack');

export const getSlackOAuthRedirectUri = helpers.getOAuthRedirectUri;
export const coerceSavedSlackRedirectUri = helpers.coerceSavedRedirectUri;
