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

  it('keeps a heading that already starts its own line whole', () => {
    const answer = [
      "Here's a comparison of the **ASUS ExpertBook P1** and **ASUS TUF Gaming A15**:",
      '### **ASUS ExpertBook P1 (Intel-based)**',
      '- **Processors**: Intel Core i3',
    ].join('\n');
    const out = normalizeAssistantMarkdownSpacing(answer);

    expect(out).toContain('\n\n### **ASUS ExpertBook P1 (Intel-based)**\n');
    expect(out).not.toMatch(/\n#\n/);
  });

  it('rejoins a heading split by older versions', () => {
    const stored = 'Intro text:\n#\n\n## **Key Features**\n- Fast';
    expect(normalizeAssistantMarkdownSpacing(stored)).toBe(
      'Intro text:\n\n### **Key Features**\n- Fast',
    );
  });

  it('does not turn C# into a heading', () => {
    const text = 'Use C# is fine and F# too.';
    expect(normalizeAssistantMarkdownSpacing(text)).toBe(text);
  });

  it('splits a packed search overview into a label and one bullet per item', () => {
    const packed =
      'It lasts 6–8 hours. **Key Differences:** - **Texture & Application:** Glides on smoothly. ' +
      '- **Finish:** Soft matte. - **Skin Type Suitability:** Best for oily skin.';
    const out = normalizeAssistantMarkdownSpacing(packed);

    expect(out).toBe(
      [
        'It lasts 6–8 hours. **Key Differences:**',
        '',
        '- **Texture & Application:** Glides on smoothly.',
        '- **Finish:** Soft matte.',
        '- **Skin Type Suitability:** Best for oily skin.',
      ].join('\n'),
    );
  });

  it('keeps " - " inside a bold product name', () => {
    const text = 'The **Lip Balm - Set of 2** costs ₹299.';
    expect(normalizeAssistantMarkdownSpacing(text)).toBe(text);
    expect(normalizeAssistantMarkdownSpacing('Try **Lip Balm - Set of 2** - it is cheap')).toBe(
      'Try **Lip Balm - Set of 2**\n- it is cheap',
    );
  });

  it('leaves comments inside code fences untouched', () => {
    const text = 'Run this:\n\n```bash\npip install x  # deps\n# start\nragsuite run\n```';
    expect(normalizeAssistantMarkdownSpacing(text)).toBe(text);
  });
});
