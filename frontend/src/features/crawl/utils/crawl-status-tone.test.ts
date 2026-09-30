import type { CrawlSource, PipelineStatus } from '@/features/crawl/types/crawl.types';
import { getDisplayStatusTone, getSourceStatusTone } from '@/features/crawl/utils/crawl.utils';

function source(pipeline: PipelineStatus): Pick<CrawlSource, 'pipeline_status' | 'status'> {
  return { pipeline_status: pipeline, status: 'READY' };
}

describe('crawl source status tone', () => {
  it('highlights sources that are actively reading or training', () => {
    expect(getSourceStatusTone(source('crawling'))).toBe('warning');
    expect(getSourceStatusTone(source('indexing'))).toBe('warning');
  });

  it('keeps queued and waiting sources neutral', () => {
    expect(getSourceStatusTone(source('queued'))).toBe('default');
    expect(getSourceStatusTone(source('waiting'))).toBe('default');
  });

  it('maps ready, failed and idle states', () => {
    expect(getSourceStatusTone(source('ready'))).toBe('primary');
    expect(getSourceStatusTone(source('failed'))).toBe('danger');
    expect(getSourceStatusTone(source('idle'))).toBe('muted');
  });

  it('falls back to the API status when no pipeline status is present', () => {
    const legacy = { status: 'RUNNING' } as Pick<CrawlSource, 'pipeline_status' | 'status'>;
    expect(getSourceStatusTone(legacy)).toBe('warning');
    expect(getSourceStatusTone({ ...legacy, status: 'FAILED' })).toBe('danger');
  });

  it('display tone matches source tone for the same status', () => {
    expect(getDisplayStatusTone('crawling')).toBe('warning');
    expect(getDisplayStatusTone('queued')).toBe('default');
    expect(getDisplayStatusTone('active')).toBe('primary');
    expect(getDisplayStatusTone('unknown')).toBe('muted');
  });
});
