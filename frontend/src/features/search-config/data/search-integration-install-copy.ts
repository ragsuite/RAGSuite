export const SEARCH_WEB_INTEGRATION = {
  title: 'Web Integration',
  subtitle: 'Embed the search widget on your website',
  scriptLabel: 'Web Widget Script',
  commentTitle: 'RAG Suite Search Widget',
  commentPlacement:
    'Add this script before the closing </body> tag. Use absolute https:// URLs for src and data-api-endpoint. Optional: data-container="#your-slot" to mount inline into a specific element (without it the loader mounts to <body>, never <head>). After RAGSuiteSearchWidget is bound (ready/resize handshake), if you re-parent, move the search widget host root — never the inner iframe alone. Do not park the widget under display:none — use position:fixed;left:-10000px if you must keep it off-screen. Relocate later with RAGSuiteSearchWidget.mountTo("#your-slot") or window.postMessage({source:"ragsuite-search-host",type:"mountTo",selector:"#your-slot"}, "*") — iframe content may reload on move; call destroy() before full script re-inject on view transitions. Focus the search field with: iframe.contentWindow.postMessage({type:"ragsuite:focus"}, embedOrigin) or {source:"ragsuite-search-host",type:"focus"} (embed replies with {source:"ragsuite-search-embed",type:"focus-ack"}). data-cache-bust / ?v= busts caches (use "latest" to follow the instance WIDGET_ASSET_VERSION); it does not pin an immutable build. Init also replaces known stale values — regenerate the snippet after widget deploys.',
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
    'Install the SDK: npx expo install @ragsuite/react-native react-native-safe-area-context',
    'Import and initialise the SDK in your app',
    'Configure API key and endpoint',
    'Start using search in your mobile app',
  ],
} as const;
