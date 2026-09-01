import type { TrustDocument } from '@/features/trust-center/content/types';
import { TRUST_CENTER_UPDATED_AT, TRUST_CENTER_VERSION } from '@/features/trust-center/content/types';

export const subprocessorsEn: TrustDocument = {
  id: 'subprocessors',
  title: 'Sub-processors',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: 'How to read this list',
      paragraphs: [
        'RAGSuite is model- and infrastructure-agnostic. Which organisations process personal data depends on how you deploy and which providers you enable per project. This list describes categories. It does not hardcode customer tenant URLs.',
        'Customer-chosen LLM/embedding providers (when you paste your own API keys) are engaged by your configuration. Review those providers’ DPAs separately.',
      ],
    },
    {
      heading: 'Category A — Customer infrastructure (self-host / air-gap)',
      paragraphs: [
        'When you self-host Community or Enterprise Edition on your own servers or private cloud, the following typically remain under your control:',
      ],
      bullets: [
        'Compute and container hosts (your VMs / Kubernetes / bare metal).',
        'PostgreSQL, Redis, ChromaDB (or equivalents you configure).',
        'Reverse proxies, TLS terminators, backups, and log aggregation you operate.',
        'Local models via Ollama or OpenAI-compatible endpoints inside your perimeter — zero egress if you keep them local.',
      ],
    },
    {
      heading: 'Category B — Optional hosted model / embedding providers (Customer-configured)',
      paragraphs: [
        'If a project selects a hosted provider, prompts, conversation context, and retrieved document chunks may be sent to that provider’s API:',
      ],
      bullets: [
        'Frontier APIs (examples customers may choose): OpenAI, Anthropic, Google Gemini, Azure OpenAI.',
        'EU-oriented providers (examples): Mistral, and other EU-jurisdiction APIs the product catalogues.',
        'Embedding models corresponding to the selected provider (e.g. mistral-embed, OpenAI embedding models) or local Jina/Ollama embeddings.',
      ],
    },
    {
      heading: 'Category C — Optional connectors and integrations',
      paragraphs: [
        'Enabled only when Customer connects them:',
      ],
      bullets: [
        'Email/workspace connectors (e.g. Gmail) — OAuth tokens and synced message content.',
        'Task/knowledge connectors (e.g. ClickUp) — indexed items as configured.',
        'MCP servers/clients and n8n (Beta) — workflows may receive query or retrieval payloads Customer configures.',
        'Outbound webhooks — Customer-defined destinations.',
      ],
    },
    {
      heading: 'Category D — Communications',
      paragraphs: [
        'If SMTP or transactional email is configured by the operator, email infrastructure may process admin notification addresses and security emails (e.g. login alerts).',
      ],
    },
    {
      heading: 'Category E — Product vendor (when Processor operates managed services)',
      paragraphs: [
        'If NITSAN / RAGSuite operates a managed or supported cloud for Customer under contract, additional hosting sub-processors may apply and will be disclosed in that commercial schedule. The open-source Community Edition by default does not phone home telemetry.',
      ],
    },
    {
      heading: 'Objection and updates',
      paragraphs: [
        'For Processor-engaged sub-processors on a managed offering, Customer may object on reasonable data-protection grounds within the notice window stated in the DPA. Self-hosted customers control Category A/B/C choices directly in their environment and project Model Settings.',
      ],
    },
  ],
};

export const securityEn: TrustDocument = {
  id: 'security',
  title: 'Security — Technical and Organisational Measures (TOMs)',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: '1. Purpose',
      paragraphs: [
        'These TOMs describe measures designed to protect Customer Content processed by RAGSuite, aligned with GDPR Article 32. Actual effectiveness depends on correct deployment, patching, and Customer operational practices for self-hosted installations.',
      ],
    },
    {
      heading: '2. Encryption and secrecy',
      paragraphs: [
        'Measures include:',
      ],
      bullets: [
        'TLS for API and web traffic in recommended deployments.',
        'Encryption of LLM provider API keys at rest in application settings storage.',
        'Password hashing for local accounts; optional TOTP / email 2FA.',
        'Product API keys issued for programmatic access; treat as secrets.',
      ],
    },
    {
      heading: '3. Access control and isolation',
      paragraphs: [
        'Project-scoped configuration for chatbot and search settings, documents, and embeddings.',
        'Authentication required for admin console; embed widgets use project-scoped public credentials.',
        'Organisation membership and permissions where Enterprise organisation features are licensed.',
        'Principle of least privilege for operational access to production systems (Customer-operated for self-host).',
      ],
    },
    {
      heading: '4. Integrity, availability, and resilience',
      paragraphs: [
        'PostgreSQL as system of record; Redis for short-lived session/cache data; vector store for embeddings.',
        'System Health monitoring surfaces in the Community Edition console.',
        'Customer-controlled backups and disaster recovery for self-hosted deployments.',
        'Background job retention/archival as configured in the product.',
      ],
    },
    {
      heading: '5. Logging, audit, and monitoring',
      paragraphs: [
        'Security audit events may record actor, action, IP address, and user agent.',
        'Login sessions may store IP and user agent for security.',
        'Community Edition includes basic audit capabilities; Enterprise may extend retention and export.',
        'Application logs should be configured by operators to minimise unnecessary personal data; query text may appear if verbose logging is enabled — restrict access accordingly.',
        'Deletion receipts (Compliance → Deletion log) record hard-delete and retention-purge outcomes with counts and scope metadata only—no raw query text—and are retained as proof of erasure.',
        'When auto-delete is enabled, audit events older than the organization retention period are permanently removed from the database; backup copies may persist until operator backup retention expires.',
      ],
    },
    {
      heading: '6. Development and supply chain',
      paragraphs: [
        'Community Edition source is publicly inspectable (Apache 2.0).',
        'Dependency and container hygiene are Customer/operator responsibilities in self-host environments.',
        'No product requirement for outbound telemetry beacons; network egress can be verified in air-gapped designs when only local models are used.',
      ],
    },
    {
      heading: '7. Human access',
      paragraphs: [
        'Support staff access to Customer Content (managed offerings) is limited to need-to-know, under confidentiality, and typically only with Customer authorisation except for urgent security response.',
      ],
    },
    {
      heading: '8. Certifications',
      paragraphs: [
        'This Trust Center does not claim SOC 2 or ISO certificates unless separately published by the vendor for a specific offering. Customers may require independent audits under the DPA. Partner deployments (e.g. agencies) may hold their own assessments (such as TISAX) independent of this software distribution.',
      ],
    },
  ],
};

export const processingEn: TrustDocument = {
  id: 'processing',
  title: 'Processing inventory and retention',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: 'Inventory overview',
      paragraphs: [
        'The following inventory maps RAGSuite features to typical personal-data processing. Organization-wide retention is enforced server-side when auto-delete is enabled (default: OFF until an admin enables it). Deletion receipts record erasure counts without storing raw query text.',
      ],
    },
    {
      heading: 'Scheduled retention (when auto-delete is enabled)',
      paragraphs: [
        'Retention period is configurable from 7 to 365 days (default 90 when enabled). Auto-delete defaults to OFF until an organization admin enables it in Settings.',
        'When auto-delete runs, the following are permanently removed from the database (hard delete) after the configured retention period:',
      ],
      bullets: [
        'Chat/search messages and feedback',
        'Query logs (analytics query text)',
        'Daily analytics aggregates',
        'Widget session keys in Redis (best-effort)',
        'Audit events (org-scoped; Community Edition may still limit audit log browsing in the UI to ~30 days)',
      ],
    },
    {
      heading: 'Not erased by scheduled retention',
      paragraphs: [
        'The following remain until you delete them manually or delete the project or account:',
      ],
      bullets: [
        'Projects, documents, crawled/indexed content, and embeddings',
        'Connector configs and admin accounts',
        'Deletion receipts (metadata-only proof of erasure; no raw query text)',
      ],
    },
    {
      heading: 'AI Assistant (Chat) — both end users and admins',
      paragraphs: [
        'Stores: user messages, assistant responses, session IDs, optional feedback, citation/source metadata.',
        'Redis may hold short-lived chat session state (sliding TTL).',
        'Deletion: conversation delete / project delete features; scheduled retention purge when enabled (see Scheduled retention above); Redis TTL expires ephemeral session state.',
        'Deletion proof: each hard delete and retention purge issues a deletion receipt (counts and scope hash, no raw PII).',
      ],
    },
    {
      heading: 'AI Search',
      paragraphs: [
        'Stores: search queries, answers, citations; may share persistence patterns with chat message storage differentiated by message type/mode.',
        'Query analytics rows may retain query text with project/user/API-key references.',
        'Deletion: aligned with history/project deletion and scheduled retention when enabled (see Scheduled retention above).',
      ],
    },
    {
      heading: 'Documents, crawl, connectors, vectors',
      paragraphs: [
        'Stores: page/file text, titles, URLs, connector payloads (e.g. email bodies when Gmail staging is used), embeddings in the vector database.',
        'Retention: until Customer deletes sources/documents/projects and purges vectors; staged connector data may have product-specific short retention (e.g. staged email cleanup windows).',
      ],
    },
    {
      heading: 'Accounts, sessions, audits',
      paragraphs: [
        'Admin users: email, credentials/hashes, optional profile fields, 2FA secrets.',
        'Sessions and email-verification metadata: IP address, user agent.',
        'Audit events: actor, summary, IP, user agent, details JSON.',
        'Retention: when auto-delete is enabled, audit events older than the organization retention period are permanently removed from the database (see Scheduled retention above). Community Edition may limit how far back you can browse audit logs in the UI (~30 days) independently of purge. Enterprise may offer longer audit retention and exports.',
      ],
    },
    {
      heading: 'Integrations',
      paragraphs: [
        'Embed scripts themselves are not personal data; runtime traffic carries queries/answers.',
        'Webhooks/n8n may forward event payloads Customer configures — Customer controls destinations.',
        'Provider API keys and product API keys are confidential configuration.',
      ],
    },
    {
      heading: 'Data subject requests',
      paragraphs: [
        'Controllers should use in-product deletion (conversations, projects, documents) and Compliance deletion receipts as evidence of erasure. Broader data-export or portability requests for end-users may require your operational procedures or Processor support on managed offerings—the Community Edition does not provide a full automated data-subject export portal.',
      ],
    },
  ],
};

export const aiEn: TrustDocument = {
  id: 'ai',
  title: 'AI transparency',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: 'What leaves your perimeter (optional)',
      paragraphs: [
        'When a project uses a hosted chat or embedding provider, RAGSuite may transmit:',
      ],
      bullets: [
        'The current user query (chat or search).',
        'Recent conversation turns for chat contextualisation.',
        'Retrieved document chunks (RAG context) that may contain personal data present in your corpus.',
        'System / search prompts and generation parameters.',
        'For embeddings: text of documents or queries being embedded.',
      ],
    },
    {
      heading: 'What stays local by design',
      paragraphs: [
        'With Ollama or other local OpenAI-compatible endpoints, model inference can remain entirely on Customer infrastructure.',
        'Citations bind answers to Customer sources — verify before acting.',
        'Community Edition does not require product telemetry phone-home.',
      ],
    },
    {
      heading: 'Training',
      paragraphs: [
        'RAGSuite Processor policy for Customer Content: not used to train Processor’s foundation models. Hosted providers’ training policies are governed by the agreement between Customer (or Processor) and that provider — select business tiers that include a DPA and no-training commitments where required.',
      ],
    },
    {
      heading: 'Human oversight',
      paragraphs: [
        'Feedback and audit tooling help Customer improve quality. Enterprise Compare Models and deep query tracing (where licensed) support evaluation without changing the core DPA roles.',
      ],
    },
    {
      heading: 'EU AI Act readiness (product positioning)',
      paragraphs: [
        'RAGSuite emphasises transparency (citations), human control (self-host, your keys), and auditability. Customer remains responsible for classifying their use case under applicable AI regulation and for risk assessments.',
      ],
    },
  ],
};
