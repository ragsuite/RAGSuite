import { Redirect } from 'expo-router';

/** Legacy training Chat History session → main History module. */
export default function ChatbotChatHistorySessionRouteRedirect() {
  return <Redirect href="/(app)/history" />;
}
