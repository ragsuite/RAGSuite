export const WEB_INTEGRATION = {
  title: 'Web Integration',
  subtitle: 'Embed the chatbot widget on your website',
  scriptLabel: 'Web Widget Script',
  commentTitle: 'RAG Suite Chatbot Widget',
  commentPlacement:
    'Add this script before the closing </body> tag. Use absolute https:// URLs for src and data-api-endpoint. Optional host theming (after ready): iframe.contentWindow.postMessage({source:"ragsuite-chatbot-host",type:"theme",theme:{primaryColor,secondaryColor,headerColor,backgroundColor,textColor,logoUrl,avatarUrl,avatarId,launcherLabel,bubbleMessage,accentColor}}, embedOrigin). data-cache-bust / ?v= pins a build (use "latest" to follow the instance WIDGET_ASSET_VERSION); init also replaces known stale values — regenerate or bump after widget deploys.',
  copySuccessTitle: 'Copied',
  copySuccessDescription: 'Web script copied to clipboard',
  regenerateSuccessTitle: 'Script Regenerated',
  regenerateSuccessDescription: 'New embed script generated with current settings',
  regenerateButton: 'Regenerate',
  instructionsTitle: 'Installation Instructions:',
  instructions: {
    copy: 'Copy the script above',
    pasteBefore: 'Paste it before the closing',
    pasteAfter: 'tag in your HTML',
    replaceBefore: 'Replace',
    replaceAfter:
      'with your actual project ID (automatically filled if you have an active project)',
    refresh: 'Save and refresh your website',
    appear: 'The chatbot widget will appear on your page',
    noteLabel: 'Note:',
    noteBefore: 'Make sure your backend is configured to serve widget files at',
    noteAfter: 'endpoint',
  },
} as const;

export const MOBILE_INTEGRATION = {
  title: 'Mobile Integration',
  subtitle: 'Integrate the chatbot SDK in your mobile app.',
  steps: [
    'Run npx expo install @ragsuite/react-native react-native-safe-area-context in your Expo / React Native project.',
    'Import SafeAreaProvider and RAGSuiteProvider from @ragsuite/react-native.',
    'Set projectId, apiKey (rgs_live_…), and endpoint in RAGSuiteProvider.',
    'Add RAGSuiteChat inside RAGSuiteProvider with features={[\'chat\']}.',
    'Rebuild the app and verify on a device or simulator.',
  ],
} as const;
