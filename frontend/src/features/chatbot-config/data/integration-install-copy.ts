export const WEB_INTEGRATION = {
  title: 'Web Integration',
  subtitle: 'Embed the chatbot widget on your website',
  scriptLabel: 'Web Widget Script',
  commentTitle: 'RAG Suite Chatbot Widget',
  commentPlacement:
    'Add this script before the closing </body> tag. Use absolute https:// URLs for src and data-api-endpoint. After RAGSuiteWidget is bound (ready/resize handshake), if you re-parent, move #ragsuite-chatbot-shell-<projectId> — never the inner #ragsuite-chatbot-embed-<projectId> iframe. Do not park the widget under display:none — use position:fixed;left:-10000px if you must keep it off-screen. Optional host theming (after ready, may be sent more than once): iframe.contentWindow.postMessage({source:"ragsuite-chatbot-host",type:"theme",theme:{primaryColor,secondaryColor,headerColor,backgroundColor,textColor,logoUrl,avatarUrl,avatarId,launcherLabel,bubbleMessage,accentColor}}, embedOrigin) — later posts update colours and bubbleMessage live. data-cache-bust / ?v= busts caches (use "latest" to follow the instance WIDGET_ASSET_VERSION); it does not pin an immutable build. Init also replaces known stale values — regenerate the snippet after widget deploys.',
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
