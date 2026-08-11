import React from 'react';

type Props = {
  children: React.ReactNode;
};

export function ToastProvider({ children }: Props) {
  return <>{children}</>;
}
