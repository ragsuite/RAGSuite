export type MobileIntegrationFeature = 'chat' | 'search';

export type BuildReactNativeIntegrationSnippetOptions = {
  projectId?: string;
  apiKey?: string;
  endpoint: string;
  features: MobileIntegrationFeature[];
};

export function buildReactNativeIntegrationSnippet(
  options: BuildReactNativeIntegrationSnippetOptions,
): string {
  const projectId = options.projectId ?? 'YOUR_PROJECT_ID';
  const apiKey = options.apiKey ?? 'rgs_live_YOUR_MOBILE_KEY';
  const endpoint = options.endpoint.replace(/\/$/, '');
  const featuresLiteral = options.features.map((feature) => `'${feature}'`).join(', ');
  const chatImport = options.features.includes('chat') ? 'RAGSuiteChat' : null;
  const searchImport = options.features.includes('search') ? 'RAGSuiteSearch' : null;
  const componentImports = [chatImport, searchImport].filter(Boolean).join(', ');
  const componentLines = [
    options.features.includes('search') ? '        <RAGSuiteSearch />' : null,
    options.features.includes('chat') ? '        <RAGSuiteChat />' : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `# Install — SDK auto-routes Expo vs CLI natives (no wiring in app code)
# Expo:
npx expo install @ragsuite/react-native react-native-safe-area-context expo-blur expo-linear-gradient expo-clipboard

# RN CLI:
npm install @ragsuite/react-native react-native-safe-area-context @react-native-community/blur react-native-linear-gradient @react-native-clipboard/clipboard
# cd ios && pod install && rebuild

import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RAGSuiteProvider, ${componentImports} } from '@ragsuite/react-native';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar translucent />
      <RAGSuiteProvider
        projectId="${projectId}"
        apiKey="${apiKey}"
        endpoint="${endpoint}"
        features={[${featuresLiteral}]}
      >
        <View style={{ flex: 1 }}>
          {/* Your app navigator / screens — same snippet for every customer app */}
${componentLines}
        </View>
      </RAGSuiteProvider>
    </SafeAreaProvider>
  );
}

# Native tab bar apps: launcher auto-offsets above tab stack. Stack-only: <RAGSuiteChat tabBarOffset={0} />`;
}
