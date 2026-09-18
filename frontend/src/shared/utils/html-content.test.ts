import { isHtmlContent } from '@/shared/utils/html-content';

describe('isHtmlContent', () => {
  it('detects intentional HTML answers', () => {
    expect(isHtmlContent('<p>Hello</p>')).toBe(true);
    expect(isHtmlContent('<div><strong>Hi</strong></div>')).toBe(true);
    expect(isHtmlContent('<h2>Title</h2><ul><li>One</li></ul>')).toBe(true);
    expect(isHtmlContent('Intro <br/> more')).toBe(true);
  });

  it('does not treat markdown or generics as HTML', () => {
    expect(isHtmlContent('### Key Differences\n\n- CE\n- EE')).toBe(false);
    expect(isHtmlContent('Use List<string> or Map<int, string>.')).toBe(false);
    expect(isHtmlContent('See <https://example.com> for docs.')).toBe(false);
    expect(isHtmlContent('Cost is €0.')).toBe(false);
  });
});
