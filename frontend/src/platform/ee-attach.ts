import { attachEnterpriseUi } from '@ragsuite-ee/boot';

/** Metro resolves to EE boot or CE no-op stubs. Call once at app/embed start. */
attachEnterpriseUi();
