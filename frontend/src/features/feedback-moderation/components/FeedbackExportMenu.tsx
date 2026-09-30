import React from "react";

import { useTranslation } from "@/i18n";
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

export function FeedbackExportMenu(props: Props) {
  const { t } = useTranslation();
  const menu = t("feedbackModeration.export");

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
