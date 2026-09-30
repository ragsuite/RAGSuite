import {
  buildAuditEventsExportQuery,
  buildAuditEventsQuery,
  handleExportAuditEvents,
} from '@/network/actions/audit-log.actions';
import { getText } from '@/network/request';

jest.mock('@/network/request', () => ({
  get: jest.fn(),
  getText: jest.fn(),
}));

const PROJECT_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1]);
}

describe('buildAuditEventsQuery', () => {
  it('keeps the list query shape (pagination + filters)', () => {
    const url = buildAuditEventsQuery({
      limit: 25,
      offset: 50,
      q: '  login ',
      project: 'all',
      category: 'identity',
      severity: 'all',
      status: 'failure',
    });
    expect(url.startsWith('/api/v1/audit-events?')).toBe(true);
    const search = paramsOf(url);
    expect(search.get('limit')).toBe('25');
    expect(search.get('offset')).toBe('50');
    expect(search.get('q')).toBe('login');
    expect(search.get('all_projects')).toBe('true');
    expect(search.get('category')).toBe('identity');
    expect(search.has('severity')).toBe(false);
    expect(search.get('status')).toBe('failure');
  });
});

describe('buildAuditEventsExportQuery', () => {
  it('sends the same filters as the list plus format, without pagination', () => {
    const url = buildAuditEventsExportQuery({
      format: 'json',
      q: 'rename',
      project: PROJECT_ID,
      category: 'config',
      severity: 'high',
      status: 'all',
    });
    expect(url.startsWith('/api/v1/audit-events/export?')).toBe(true);
    const search = paramsOf(url);
    expect(search.get('format')).toBe('json');
    expect(search.get('project_id')).toBe(PROJECT_ID);
    expect(search.get('q')).toBe('rename');
    expect(search.get('category')).toBe('config');
    expect(search.get('severity')).toBe('high');
    expect(search.has('status')).toBe(false);
    expect(search.has('offset')).toBe(false);
    expect(search.has('limit')).toBe(false);
  });

  it('maps account and active project scopes', () => {
    expect(paramsOf(buildAuditEventsExportQuery({ format: 'csv', project: 'account' })).get('account_only')).toBe(
      'true',
    );
    const active = paramsOf(buildAuditEventsExportQuery({ format: 'csv', project: 'active' }));
    expect(active.has('project_id')).toBe(false);
    expect(active.has('all_projects')).toBe(false);
  });
});

describe('handleExportAuditEvents', () => {
  it('uses the server filename and content type', async () => {
    jest.mocked(getText).mockResolvedValueOnce({
      body: 'id,timestamp\n',
      contentType: 'text/csv; charset=utf-8',
      contentDisposition: 'attachment; filename="audit-logs-20260930-101500.csv"',
    });
    await expect(handleExportAuditEvents({ format: 'csv' })).resolves.toEqual({
      content: 'id,timestamp\n',
      format: 'csv',
      filename: 'audit-logs-20260930-101500.csv',
      mimeType: 'text/csv',
    });
  });

  it('falls back to a generated filename and format mime type', async () => {
    jest.mocked(getText).mockResolvedValueOnce({ body: '[]', contentType: null, contentDisposition: null });
    const result = await handleExportAuditEvents({ format: 'json' });
    expect(result.filename).toMatch(/^audit-logs-.+\.json$/);
    expect(result.mimeType).toBe('application/json;charset=utf-8');
  });
});
