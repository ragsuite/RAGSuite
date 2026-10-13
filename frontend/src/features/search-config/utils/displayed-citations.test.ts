import { displayedCitations } from '@/features/search-config/utils/displayed-citations';
import type { SearchTestCitation, SearchTestResult } from '@/features/search-config/types/search-config.types';

const early: SearchTestCitation[] = [
  { id: 'e1', title: 'Gift Card Store', url: 'https://shop.example/gift', excerpt: '' },
];

function result(citations: SearchTestCitation[], answer = 'Answer'): SearchTestResult {
  return { id: 'm1', answer, citations, latencyMs: 10 };
}

describe('displayedCitations', () => {
  it('shows early sources while the answer is still streaming', () => {
    expect(displayedCitations(null, early)).toEqual(early);
  });

  it('hides early sources when the final answer is a refusal without sources', () => {
    const refusal = result([], 'I am sorry, this query is out of the context of the provided documents.');
    expect(displayedCitations(refusal, early)).toEqual([]);
  });

  it('prefers the final sources over the early ones', () => {
    const final: SearchTestCitation[] = [
      { id: 'f1', title: 'Product', url: 'https://shop.example/product', excerpt: '' },
    ];
    expect(displayedCitations(result(final), early)).toEqual(final);
  });

  it('returns an empty list before anything arrives', () => {
    expect(displayedCitations(undefined, undefined)).toEqual([]);
  });
});
