import {
  mapChatWidgetCustomizationFromApi,
  mapChatWidgetCustomizationToApi,
} from '@/features/chatbot-config/utils/chatbot-api-mappers';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import {
  extractPresetAvatarId,
  mapWidgetAvatarFromApi,
  prepareChatWidgetCustomizationForSave,
  resolveWidgetAvatarForApi,
} from '@/features/chatbot-config/utils/widget-avatar-display';

function mockImageFetchAsDataUrl(dataUrl: string) {
  const originalFetch = globalThis.fetch;
  const OriginalFileReader = globalThis.FileReader;

  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    blob: async () => new Blob(['fake-image'], { type: 'image/png' }),
  })) as unknown as typeof fetch;

  class MockFileReader {
    result: string | null = null;
    onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
    readAsDataURL() {
      this.result = dataUrl;
      this.onload?.({} as ProgressEvent<FileReader>);
    }
  }

  globalThis.FileReader = MockFileReader as unknown as typeof FileReader;

  return () => {
    globalThis.fetch = originalFetch;
    globalThis.FileReader = OriginalFileReader;
  };
}

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
  logoShape: 'circle',
  logoBorderRadius: 8,
  showDateTime: true,
  showDisclaimer: true,
  disclaimerText: '',
  showDisclaimerLink: true,
  disclaimerLinkLabel: '',
  disclaimerLinkUrl: '',
};

const BASE_CONFIG: ChatWidgetConfig = {
  title: 'RAGSuite',
  heroTitle: '',
  heroSubtitle: '',
  widgetLayout: 'direct',
  homeDisplayName: '',
  homeStatusText: '',
  homeCtaLabel: '',
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

  it('roundtrips logo shape and border radius through api mappers', () => {
    const mapped = mapChatWidgetCustomizationFromApi(
      {
        widget_logo_shape: 'flexible',
        widget_logo_border_radius: 14,
      },
      BASE_CUSTOMIZATION,
    );
    expect(mapped.logoShape).toBe('flexible');
    expect(mapped.logoBorderRadius).toBe(14);

    const apiBody = mapChatWidgetCustomizationToApi(mapped, BASE_CONFIG);
    expect(apiBody.widget_logo_shape).toBe('flexible');
    expect(apiBody.widget_logo_border_radius).toBe(14);

    const defaults = mapChatWidgetCustomizationFromApi({}, BASE_CUSTOMIZATION);
    expect(defaults.logoShape).toBe('circle');
    expect(defaults.logoBorderRadius).toBe(8);
  });

  it('omits unchanged logo and avatar from the API body', () => {
    const previous: ChatWidgetCustomization = {
      ...BASE_CUSTOMIZATION,
      logoUrl: 'data:image/png;base64,logo',
      avatarId: 'custom',
      avatarUrl: 'data:image/png;base64,avatar',
    };
    const next: ChatWidgetCustomization = {
      ...previous,
      panelBorderRadius: 12,
    };
    const body = mapChatWidgetCustomizationToApi(next, BASE_CONFIG, previous);
    expect(body.widget_logo_url).toBeUndefined();
    expect(body.widget_avatar).toBeUndefined();
    expect(body.widget_panel_border_radius).toBe(12);
  });

  it('sends null logo when cleared and includes a new logo when changed', () => {
    const previous: ChatWidgetCustomization = {
      ...BASE_CUSTOMIZATION,
      logoUrl: 'data:image/png;base64,logo',
    };
    const cleared = mapChatWidgetCustomizationToApi(
      { ...previous, logoUrl: null },
      BASE_CONFIG,
      previous,
    );
    expect(cleared.widget_logo_url).toBeNull();

    const replaced = mapChatWidgetCustomizationToApi(
      { ...previous, logoUrl: 'https://cdn.example.com/new-logo.png' },
      BASE_CONFIG,
      previous,
    );
    expect(replaced.widget_logo_url).toBe('https://cdn.example.com/new-logo.png');
  });

  it('skips blob-to-dataUrl conversion when logo is unchanged from previous', async () => {
    const restore = mockImageFetchAsDataUrl('data:image/png;base64,should-not-run');
    try {
      const previous: ChatWidgetCustomization = {
        ...BASE_CUSTOMIZATION,
        logoUrl: 'blob:https://example.com/same',
      };
      const prepared = await prepareChatWidgetCustomizationForSave(
        { ...previous },
        previous,
      );
      expect(prepared.logoUrl).toBe('blob:https://example.com/same');
    } finally {
      restore();
    }
  });

  it('converts non-persistable logoUrl to a data URL on save', async () => {
    const dataUrl = 'data:image/png;base64,logo';
    const restore = mockImageFetchAsDataUrl(dataUrl);

    try {
      const prepared = await prepareChatWidgetCustomizationForSave({
        ...BASE_CUSTOMIZATION,
        logoUrl: 'blob:https://example.com/logo-uuid',
      });
      expect(prepared.logoUrl).toBe(dataUrl);
    } finally {
      restore();
    }
  });

  it('leaves persistable logoUrl unchanged on save', async () => {
    const httpsLogo = 'https://cdn.example.com/logo.png';
    const dataLogo = 'data:image/png;base64,keep';

    await expect(
      prepareChatWidgetCustomizationForSave({
        ...BASE_CUSTOMIZATION,
        logoUrl: httpsLogo,
      }),
    ).resolves.toMatchObject({ logoUrl: httpsLogo });

    await expect(
      prepareChatWidgetCustomizationForSave({
        ...BASE_CUSTOMIZATION,
        logoUrl: dataLogo,
      }),
    ).resolves.toMatchObject({ logoUrl: dataLogo });
  });

  it('converts logo even when avatar is already persistable', async () => {
    const logoDataUrl = 'data:image/png;base64,logo-only';
    const restore = mockImageFetchAsDataUrl(logoDataUrl);

    try {
      const prepared = await prepareChatWidgetCustomizationForSave({
        ...BASE_CUSTOMIZATION,
        avatarId: 'custom',
        avatarUrl: 'data:image/png;base64,avatar',
        logoUrl: 'blob:https://example.com/logo-uuid',
      });
      expect(prepared.avatarUrl).toBe('data:image/png;base64,avatar');
      expect(prepared.logoUrl).toBe(logoDataUrl);
    } finally {
      restore();
    }
  });
});
