import { useToast } from '@/shared/toast/use-toast.web';

describe('useToast (web)', () => {
  it('returns the same function references on every call', () => {
    const first = useToast();
    const second = useToast();

    expect(first.toast).toBe(second.toast);
    expect(first.dismiss).toBe(second.dismiss);
    expect(first.update).toBe(second.update);
    expect(first.pause).toBe(second.pause);
    expect(first.resume).toBe(second.resume);
    expect(first.pauseAll).toBe(second.pauseAll);
    expect(first.resumeAll).toBe(second.resumeAll);
  });
});
