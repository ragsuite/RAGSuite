export const SEARCH_WEB_INTEGRATION = {
  title: 'Web Integration',
  subtitle: 'Embed the search widget on your website',
  scriptLabel: 'Web Widget Script',
  commentTitle: 'RAG Suite Search Widget',
  commentPlacement: 'Add this script before the closing </body> tag',
  copySuccessTitle: 'Copied',
  copySuccessDescription: 'Web script copied to clipboard',
  regenerateSuccessTitle: 'Regenerated',
  regenerateSuccessDescription: 'Search widget script has been regenerated',
  regenerateButton: 'Regenerate',
} as const;

export const SEARCH_MOBILE_INTEGRATION = {
  title: 'Mobile Integration',
  subtitle: 'Integrate the search SDK in your mobile app',
  scriptLabel: 'Mobile SDK Code',
  instructionsTitle: 'Installation instructions:',
  steps: [
    'Install the SDK: npm install @company/search-sdk',
    'Import and initialise the SDK in your app',
    'Configure API key and endpoint',
    'Start using search in your mobile app',
  ],
} as const;
