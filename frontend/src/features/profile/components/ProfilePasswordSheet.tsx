import { KeyRound } from 'lucide-react-native';
import React from 'react';

import { PasswordForm } from '@/features/profile/components/PasswordForm';
import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  visible: boolean;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  errors: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
  loading: boolean;
  onChange: (key: 'currentPassword' | 'newPassword' | 'confirmPassword', value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function ProfilePasswordSheet({
  visible,
  currentPassword,
  newPassword,
  confirmPassword,
  errors,
  loading,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const copy = useProfileCopy();

  return (
    <AdaptiveOverlay
      visible={visible}
      title={copy.fields.updatePassword}
      subtitle={copy.sections.password.description}
      onClose={onClose}
      maxWidth={448}
      presentation="dialog"
      footer={
        <OverlayDialogFooter
          cancelLabel={copy.dialogs.cancel}
          cancelIcon={ActionIcons.close}
          primaryLabel={loading ? copy.fields.updatingPassword : copy.fields.updatePassword}
          primaryIcon={KeyRound}
          onCancel={onClose}
          onPrimary={onSubmit}
          primaryLoading={loading}
          primaryDisabled={loading}
          cancelDisabled={loading}
        />
      }>
      <PasswordForm
        embedded
        currentPassword={currentPassword}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        errors={errors}
        loading={loading}
        disabled={loading}
        showSubmit={false}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </AdaptiveOverlay>
  );
}
