import { createConnectorOAuthHelpers } from '@/features/crawl/utils/connector-oauth';

const helpers = createConnectorOAuthHelpers('sharepoint');

export const getSharePointOAuthRedirectUri = helpers.getOAuthRedirectUri;
export const coerceSavedSharePointRedirectUri = helpers.coerceSavedRedirectUri;
