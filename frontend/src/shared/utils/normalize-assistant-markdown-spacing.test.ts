import { normalizeAssistantMarkdownSpacing } from '@/shared/utils/normalize-assistant-markdown-spacing';

describe('normalizeAssistantMarkdownSpacing', () => {
  it('expands jammed buy-EE style lists and code fences into real blocks', () => {
    const jammed =
      '**Steps:** - Contact sales for an EE license - Place the license file, then use: ```bash ragsuite activate --license ./license.json ```';
    const out = normalizeAssistantMarkdownSpacing(jammed);

    expect(out).toContain('**Steps:**\n\n- Contact sales');
    expect(out).toContain('\n- Place the license');
    expect(out).toMatch(/```bash\nragsuite activate/);
    expect(out).toMatch(/\n```\s*$/);
    expect(out.split('\n').length).toBeGreaterThan(3);
  });

  it('leaves well-formed markdown unchanged', () => {
    const well = [
      '**Steps:**',
      '',
      '- Contact sales for an EE license',
      '- Place the license file, then use:',
      '',
      '```bash',
      'ragsuite activate --license ./license.json',
      '```',
    ].join('\n');

    expect(normalizeAssistantMarkdownSpacing(well)).toBe(well);
  });

  it('returns empty / whitespace input as-is', () => {
    expect(normalizeAssistantMarkdownSpacing('')).toBe('');
    expect(normalizeAssistantMarkdownSpacing('   ')).toBe('   ');
  });

  it('splits jammed ordered lists', () => {
    const out = normalizeAssistantMarkdownSpacing(
      'Do this: 1. First step 2. Second step',
    );
    expect(out).toContain('\n1. First step');
    expect(out).toContain('\n2. Second step');
  });

  it('splits mid-line ATX headers and jammed bullets (fast one-chunk answers)', () => {
    const jammed =
      '### Key Differences Between CE and EE #### 1. Licensing & Cost - Community Edition (CE) - Free. #### 2. Features - SSO on EE.';
    const out = normalizeAssistantMarkdownSpacing(jammed);

    expect(out.startsWith('### Key Differences')).toBe(true);
    expect(out).toMatch(/\n\n#### 1\. Licensing/);
    expect(out).toMatch(/\n\n#### 2\. Features/);
    expect(out).toContain('\n- Community Edition (CE)');
    expect(out).toContain('\n- Free.');
    expect(out).toContain('\n- SSO on EE.');
    // Headers must not remain inline after the first title text.
    expect(out).not.toMatch(/EE #### 1/);
    expect(out).not.toMatch(/Cost - Community/);
  });
});
