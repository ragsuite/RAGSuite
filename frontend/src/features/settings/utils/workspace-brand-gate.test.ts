import {
  applyEffectiveWorkspaceBranding,
  canCustomizeWorkspaceBrand,
} from '@/features/settings/utils/workspace-brand-gate';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';

describe('workspace-brand-gate', () => {
  it('CE cannot customize brand', () => {
    expect(canCustomizeWorkspaceBrand(false)).toBe(false);
    expect(canCustomizeWorkspaceBrand(true)).toBe(true);
  });

  it('forces RAGSuite name and null logo on CE', () => {
    const next = applyEffectiveWorkspaceBranding(
      { orgName: 'Acme', logoDataUrl: 'data:image/png;base64,x' },
      false,
    );
    expect(next.orgName).toBe(BRANDING_DEFAULTS.orgName);
    expect(next.logoDataUrl).toBeNull();
  });

  it('keeps custom name and logo on EE', () => {
    const next = applyEffectiveWorkspaceBranding(
      { orgName: 'Acme', logoDataUrl: 'data:image/png;base64,x' },
      true,
    );
    expect(next.orgName).toBe('Acme');
    expect(next.logoDataUrl).toBe('data:image/png;base64,x');
  });

  it('falls back to RAGSuite name on EE when empty', () => {
    const next = applyEffectiveWorkspaceBranding({ orgName: '  ', logoDataUrl: null }, true);
    expect(next.orgName).toBe(BRANDING_DEFAULTS.orgName);
    expect(next.logoDataUrl).toBeNull();
  });
});
