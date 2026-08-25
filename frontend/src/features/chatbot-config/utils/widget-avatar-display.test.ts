import {
  mapChatWidgetCustomizationFromApi,
  mapChatWidgetCustomizationToApi,
} from '@/features/chatbot-config/utils/chatbot-api-mappers';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import {
  extractPresetAvatarId,
  mapWidgetAvatarFromApi,
  resolveWidgetAvatarForApi,
} from '@/features/chatbot-config/utils/widget-avatar-display';

const BASE_CUSTOMIZATION: ChatWidgetCustomization = {
  logoUrl: null,
  avatarId: 'default-1',
  avatarUrl: null,
  primaryColor: '#2E6A4E',
  secondaryColor: '#3D8B67',
  gradientAngle: 135,
  fontSize: 15,
  bubbleRadius: 16,
  avatarSize: 38,
  widgetBottomSpace: 15,
  customWidthEnabled: true,
  widgetWidth: 400,
  customHeightEnabled: true,
  widgetHeight: 600,
  panelBorderRadius: 20,
  showBackdrop: false,
  showSpeechInput: true,
  showSpeechOutput: true,
  shadow: true,
  headerColor: '#2E6A4E',
  backgroundColor: '#1a1a1a',
  textColor: '#ffffff',
  showLogo: true,
  showDateTime: true,
};

const BASE_CONFIG: ChatWidgetConfig = {
  title: 'RAGSuite',
  bubbleMessage: 'Chat with us',
  welcomeMessage: 'Hi',
  language: 'en',
  greeting: 'Hi',
  placeholder: 'Message...',
  showLauncher: true,
  launcherLabel: 'Chat',
  position: 'bottom-right',
  accentColor: '#2E6A4E',
};

describe('widget avatar persistence helpers', () => {
  it('extracts preset id from avatar asset paths', () => {
    expect(extractPresetAvatarId('default-5')).toBe('default-5');
    expect(extractPresetAvatarId('/api/v1/avatars/avatar-5.png')).toBe('default-5');
    expect(extractPresetAvatarId('https://api.example.com/api/v1/avatars/avatar-3.png')).toBe('default-3');
  });

  it('maps preset ids from api payload', () => {
    expect(mapWidgetAvatarFromApi('default-4')).toEqual({
      avatarId: 'default-4',
      avatarUrl: null,
    });
  });

  it('maps custom data urls from api payload', () => {
    const dataUrl = 'data:image/png;base64,abc';
    expect(mapWidgetAvatarFromApi(dataUrl)).toEqual({
      avatarId: 'custom',
      avatarUrl: dataUrl,
    });
  });

  it('falls back when api stores broken custom marker', () => {
    expect(mapWidgetAvatarFromApi('custom')).toEqual({
      avatarId: 'default-1',
      avatarUrl: null,
    });
  });

  it('serializes preset selection for api save', () => {
    expect(
      resolveWidgetAvatarForApi({
        ...BASE_CUSTOMIZATION,
        avatarId: 'default-5',
        avatarUrl: null,
      }),
    ).toBe('default-5');
  });

  it('serializes uploaded data urls for api save', () => {
    const dataUrl = 'data:image/png;base64,abc';
    expect(
      resolveWidgetAvatarForApi({
        ...BASE_CUSTOMIZATION,
        avatarId: 'custom',
        avatarUrl: dataUrl,
      }),
    ).toBe(dataUrl);
  });

  it('roundtrips preset avatar through api mappers', () => {
    const mapped = mapChatWidgetCustomizationFromApi(
      { widget_avatar: 'default-5' },
      BASE_CUSTOMIZATION,
    );
    expect(mapped.avatarId).toBe('default-5');
    expect(mapped.avatarUrl).toBeNull();

    const apiBody = mapChatWidgetCustomizationToApi(mapped, BASE_CONFIG);
    expect(apiBody.widget_avatar).toBe('default-5');
  });
});
