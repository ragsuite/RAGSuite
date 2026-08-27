import type { TrustDocument } from '@/features/trust-center/content/types';
import { TRUST_CENTER_UPDATED_AT, TRUST_CENTER_VERSION } from '@/features/trust-center/content/types';

export const overviewEn: TrustDocument = {
  id: 'overview',
  title: 'Trust Center — Overview',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: 'Built to be inspected',
      paragraphs: [
        'RAGSuite is a sovereign enterprise AI platform for AI Search, AI Assistant, and AI Connectors. It is designed to run on your infrastructure — self-hosted, private cloud, or air-gapped — with DSGVO by design and no product telemetry that phones home.',
        'This Trust Center publishes the legal and transparency documents EU customers and auditors typically request: the Data Processing Agreement (DPA / AVV), sub-processor categories, technical and organisational measures (TOMs), a processing inventory, and AI data-flow transparency.',
      ],
    },
    {
      heading: 'Roles under GDPR',
      paragraphs: [
        'Under the GDPR, roles depend on who decides the purposes and means of processing.',
      ],
      bullets: [
        'Customer (Controller): decides why end-user chat/search queries and documents are processed (e.g. internal knowledge assistant on your website or intranet).',
        'RAGSuite operator / NITSAN (Processor), when providing the software as a managed service or supporting your deployment under your instructions: processes personal data only to deliver RAGSuite features.',
        'Self-hosted Community Edition: when you install and operate RAGSuite entirely on your own systems, you typically remain Controller (and often also Processor of your own infra). This DPA template still documents how the software processes data so your counsel can map responsibilities.',
        'Sub-processors: hosting, LLM/embedding providers, email, or connectors you enable. Customer-chosen API keys (OpenAI, Mistral, etc.) mean those providers process prompts/chunks under the terms you accept with them.',
      ],
    },
    {
      heading: 'How to use these documents',
      paragraphs: [
        '1. Review each tab with your privacy counsel.',
        '2. Replace Controller placeholders (e.g. [CONTROLLER_LEGAL_NAME]) before countersigning a DPA.',
        '3. Export Markdown or Print to PDF for procurement / auditor packs.',
        '4. Keep the Sub-processors list aligned with the LLM providers and connectors you actually enable per project.',
      ],
    },
    {
      heading: 'Important disclaimer',
      paragraphs: [
        'These materials are professional transparency templates tailored to RAGSuite’s product behaviour. They are not a substitute for advice from qualified counsel, a countersigned contract, or customer-specific schedules (retention periods, SCCs configuration, liability caps). Do not treat UI copy as a signed DPA until parties execute it.',
      ],
    },
    {
      heading: 'Placeholders used in the DPA',
      paragraphs: [
        'Replace the following tokens before execution. Do not commit customer-specific URLs into the open-source repository.',
      ],
      bullets: [
        '[CONTROLLER_LEGAL_NAME]',
        '[CONTROLLER_ADDRESS]',
        '[CONTROLLER_CONTACT_EMAIL]',
        '[CONTROLLER_SIGNATORY_NAME]',
        '[EFFECTIVE_DATE]',
      ],
    },
  ],
};
