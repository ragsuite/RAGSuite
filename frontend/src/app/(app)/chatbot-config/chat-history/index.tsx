import { Redirect } from 'expo-router';

/** Legacy training Chat History → main History module. */
export default function ChatbotChatHistoryRouteRedirect() {
  return <Redirect href="/(app)/history" />;
}
