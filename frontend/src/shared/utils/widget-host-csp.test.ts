import {
  buildWidgetHostCspAllowlist,
  buildWidgetHostCspHtmlComment,
  originFromWidgetUrl,
} from '@/shared/utils/widget-host-csp';

describe('widget-host-csp', () => {
  it('extracts origin from asset and API URLs', () => {
    expect(originFromWidgetUrl('https://admin.example.com/widget/v1/loader.js')).toBe(
      'https://admin.example.com',
    );
    expect(originFromWidgetUrl('https://api.example.com/api/v1')).toBe('https://api.example.com');
    expect(originFromWidgetUrl('widgets.example.com')).toBe('https://widgets.example.com');
  });

  it('builds a single-origin allowlist including frame-src', () => {
    const block = buildWidgetHostCspAllowlist('https://ragsuite.de', 'https://ragsuite.de/api/v1');
    expect(block).toContain('frame-src   https://ragsuite.de;');
    expect(block).toContain('script-src  https://ragsuite.de;');
    expect(block).toContain('connect-src https://ragsuite.de;');
    expect(block.split('https://ragsuite.de').length).toBeGreaterThan(4);
  });

  it('adds the API origin to connect-src when it differs from the widget host', () => {
    const block = buildWidgetHostCspAllowlist(
      'https://admin.example.com',
      'https://api.example.com/api/v1',
    );
    expect(block).toContain('frame-src   https://admin.example.com;');
    expect(block).toContain('connect-src https://admin.example.com https://api.example.com;');
  });

  it('wraps the allowlist as an HTML comment for embed snippets', () => {
    const comment = buildWidgetHostCspHtmlComment('https://admin.example.com', 'https://api.example.com/api/v1');
    expect(comment).toContain('frame-src   https://admin.example.com;');
    expect(comment).toContain('If your site sends a Content-Security-Policy');
    expect(comment).toContain('<!--');
  });
});
