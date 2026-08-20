import {
  faviconUrlForCitation,
  pickUniqueSourcePreviewImages,
} from '@/features/search-config/utils/source-preview-images';
import type { SearchTestCitation } from '@/features/search-config/types/search-config.types';

function cite(partial: Partial<SearchTestCitation> & Pick<SearchTestCitation, 'id' | 'url'>): SearchTestCitation {
  return {
    title: partial.title ?? 'Source',
    excerpt: partial.excerpt ?? '',
    image: partial.image ?? '',
    ...partial,
  };
}

describe('faviconUrlForCitation', () => {
  it('returns google s2 favicon for a host', () => {
    expect(faviconUrlForCitation('https://www.example.com/page')).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=64',
    );
  });

  it('returns empty for blank urls', () => {
    expect(faviconUrlForCitation('')).toBe('');
    expect(faviconUrlForCitation('#')).toBe('');
  });
});

describe('pickUniqueSourcePreviewImages', () => {
  it('prefers unique OG images then fills with favicons', () => {
    const citations = [
      cite({ id: '1', url: 'https://a.example/1', image: 'https://cdn.example/a.jpg' }),
      cite({ id: '2', url: 'https://a.example/2', image: 'https://cdn.example/a.jpg' }),
      cite({ id: '3', url: 'https://b.example/1', image: 'https://cdn.example/b.jpg' }),
      cite({ id: '4', url: 'https://c.example/1', image: '' }),
    ];
    const urls = pickUniqueSourcePreviewImages(citations, 3);
    expect(urls).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
      faviconUrlForCitation('https://a.example/1'),
    ]);
  });

  it('dedupes so shared OG does not fill all badge slots', () => {
    const shared = 'https://cdn.example/shared.jpg';
    const citations = [
      cite({ id: '1', url: 'https://site.example/a', image: shared }),
      cite({ id: '2', url: 'https://site.example/b', image: shared }),
      cite({ id: '3', url: 'https://site.example/c', image: shared }),
    ];
    const urls = pickUniqueSourcePreviewImages(citations, 3);
    expect(urls[0]).toBe(shared);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toBe(faviconUrlForCitation('https://site.example/a'));
  });
});
