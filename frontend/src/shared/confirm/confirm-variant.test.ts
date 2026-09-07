import {
  confirmVariantButton,
  resolveConfirmVariant,
} from '@/shared/confirm/confirm-variant';

describe('resolveConfirmVariant', () => {
  it('prefers explicit variant over destructive', () => {
    expect(resolveConfirmVariant({ variant: 'warning', destructive: true })).toBe('warning');
  });

  it('maps destructive to danger when variant omitted', () => {
    expect(resolveConfirmVariant({ destructive: true })).toBe('danger');
  });

  it('defaults to confirm', () => {
    expect(resolveConfirmVariant({})).toBe('confirm');
  });
});

describe('confirmVariantButton', () => {
  it('uses danger button only for danger variant', () => {
    expect(confirmVariantButton('danger')).toBe('danger');
    expect(confirmVariantButton('warning')).toBe('primary');
    expect(confirmVariantButton('confirm')).toBe('primary');
  });
});
