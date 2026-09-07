export type ConfirmVariant = 'confirm' | 'warning' | 'danger';

export function resolveConfirmVariant(options: {
  variant?: ConfirmVariant;
  destructive?: boolean;
}): ConfirmVariant {
  if (options.variant) return options.variant;
  return options.destructive ? 'danger' : 'confirm';
}

export function confirmVariantButton(
  variant: ConfirmVariant,
): 'primary' | 'danger' {
  return variant === 'danger' ? 'danger' : 'primary';
}
