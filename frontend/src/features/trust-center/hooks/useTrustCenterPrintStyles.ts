import { useEffect } from 'react';
import { Platform } from 'react-native';

const STYLE_ID = 'ragsuite-trust-center-print';

const PRINT_CSS = `
@media print {
  body * {
    visibility: hidden !important;
  }
  [data-trust-print-root="true"],
  [data-trust-print-root="true"] * {
    visibility: visible !important;
  }
  [data-trust-print-root="true"] {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    border: none !important;
    box-shadow: none !important;
    background: #fff !important;
    color: #111 !important;
  }
  [data-trust-export="true"],
  [data-trust-chrome="true"] {
    display: none !important;
    visibility: hidden !important;
  }
}
`;

/** Inject print stylesheet once so Export PDF (Print) shows only the document body. */
export function useTrustCenterPrintStyles(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
  }, []);
}
