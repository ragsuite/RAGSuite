import { useToastActionsContext } from '@/shared/toast/toast-provider';

export function useToast() {
  return useToastActionsContext();
}
