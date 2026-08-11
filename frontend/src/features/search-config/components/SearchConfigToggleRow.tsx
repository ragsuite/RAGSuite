import { AppSwitchRow } from '@/shared/components/app-switch-row';

type Props = {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  bordered?: boolean;
};

/** @deprecated Prefer AppSwitchRow — kept for existing imports. */
export function SearchConfigToggleRow(props: Props) {
  return <AppSwitchRow {...props} />;
}
