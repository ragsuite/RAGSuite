import React from "react";

import { useOrgAdminAccess } from "@/features/organization/providers/org-admin-access-provider";
import { useTranslation } from "@/i18n";
import { EnterpriseLockedIconButton } from "@/platform/ee-locked";
import {
  ExportFormatMenu,
  type ExportFormat,
} from "@/shared/components/export-format-menu";

type Props = {
  disabled?: boolean;
  exporting?: boolean;
  onExport: (format: ExportFormat) => void;
  /** Web toolbar alignment (defaults to touch target on mobile). */
  controlHeight?: number;
  /** Show labeled Export button instead of icon-only. */
  showLabel?: boolean;
};

/**
 * Feedback CSV/JSON export — Enterprise only.
 * CE shows a lock teaser; EE keeps the real export menu.
 */
export function FeedbackExportMenu(props: Props) {
  const { t } = useTranslation();
  const { enterpriseModulesAvailable } = useOrgAdminAccess();
  const menu = t("feedbackModeration.export");

  if (!enterpriseModulesAvailable) {
    return (
      <EnterpriseLockedIconButton
        accessibilityLabel={t("enterprise.locked.a11y", {
          feature: t("enterprise.locked.features.feedbackExport", {
            defaultValue: "Feedback export",
          }),
        })}
        disabled={props.disabled}
        controlHeight={props.controlHeight}
      />
    );
  }

  return (
    <ExportFormatMenu
      {...props}
      labels={{
        menu,
        csv: t("feedbackModeration.exportCsv"),
        json: t("feedbackModeration.exportJson"),
        formatA11y: (label) => `${menu} ${label}`,
      }}
    />
  );
}
