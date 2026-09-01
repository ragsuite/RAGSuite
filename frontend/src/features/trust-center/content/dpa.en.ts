import type { TrustDocument } from '@/features/trust-center/content/types';
import { TRUST_CENTER_UPDATED_AT, TRUST_CENTER_VERSION } from '@/features/trust-center/content/types';

export const dpaEn: TrustDocument = {
  id: 'dpa',
  title: 'Data Processing Agreement (DPA / AVV)',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: '1. Parties and roles',
      paragraphs: [
        'This Data Processing Agreement (“DPA”) forms part of the agreement between [CONTROLLER_LEGAL_NAME], with registered address [CONTROLLER_ADDRESS] (“Controller” / “Customer”), and the RAGSuite provider operating under the brand RAGSuite, an innovation by NITSAN (“Processor”), with public product information available via the Processor’s official website as configured in the product branding settings.',
        'Contact for privacy matters (Controller): [CONTROLLER_CONTACT_EMAIL]. Effective date: [EFFECTIVE_DATE].',
        'For GDPR Article 28 purposes, Customer is Controller of Customer Content (defined below). Processor processes Customer Content only on documented instructions from Customer, unless Union or Member State law requires otherwise.',
      ],
    },
    {
      heading: '2. Subject matter, duration, and nature of processing',
      paragraphs: [
        'Subject matter: provision of the RAGSuite software and related services enabling AI Search, AI Assistant (chatbot), document/crawl/connector ingestion, embeddings, citations, feedback, widgets, admin console, audit logging, and optional integrations (webhooks, n8n, MCP, email connectors).',
        'Duration: for the term of the underlying licence / service agreement, plus any post-termination retention period required for deletion/return of Customer Content.',
        'Nature: collection, storage, retrieval, organisation, structuring, alteration, consultation, use, disclosure by transmission (including to Customer-configured LLM/embedding providers), restriction, erasure, and destruction of personal data as needed to operate RAGSuite.',
        'Purpose: to provide Customer with citation-backed search and assistant answers grounded in Customer’s own sources; to secure and operate the platform; and to assist Customer with compliance requests as set out herein. Processor does not use Customer Content to train foundation models for Processor’s own products.',
      ],
    },
    {
      heading: '3. Categories of data subjects',
      paragraphs: [
        'Depending on Customer’s configuration, data subjects may include:',
      ],
      bullets: [
        'End users of Customer’s websites, intranet, or apps who use AI Search or AI Assistant widgets (often session-based / anonymous to Processor’s account model).',
        'Customer’s staff and administrators who log into the RAGSuite console.',
        'Individuals whose personal data appears in crawled websites, uploaded documents, or connected sources (e.g. email, task systems).',
      ],
    },
    {
      heading: '4. Types of personal data',
      paragraphs: [
        'Customer Content may include, without limitation:',
      ],
      bullets: [
        'Chat and search queries, answers, conversation/search history, feedback text and ratings.',
        'Document and page content (uploads, crawl, connectors), metadata (titles, URLs), and vector embeddings derived from that content.',
        'Admin account data: names, email addresses, authentication metadata, optional profile fields.',
        'Security data: IP addresses and user agents on sessions, email-verification flows, and audit events.',
        'Integration secrets and API keys (product and provider keys) — treated as confidential; provider keys are encrypted at rest in application storage.',
        'Technical logs that may incidentally contain query text if application logging is enabled by the operator.',
      ],
    },
    {
      heading: '5. Customer instructions and Processor obligations',
      paragraphs: [
        'Processor shall:',
      ],
      bullets: [
        'Process Customer Content only on documented instructions from Customer (including this DPA and product configuration), unless required by law — in which case Processor informs Customer unless legally prohibited.',
        'Ensure persons authorised to process Customer Content are bound by confidentiality.',
        'Implement appropriate technical and organisational measures (see Security / TOMs tab and Annex II).',
        'Respect the conditions for engaging sub-processors (Section 7 and Sub-processors tab).',
        'Processor shall, taking into account the nature of processing, assist Customer by appropriate technical and organisational measures with Customer’s obligations to respond to data subject requests.',
        'Assist Customer with security, breach notification, data protection impact assessments, and prior consultation, considering the information available to Processor.',
        'At Customer’s choice, delete or return Customer Content after end of services relating to processing, and delete existing copies unless law requires storage.',
        'Make available information necessary to demonstrate compliance and allow for audits as agreed in Section 10.',
      ],
    },
    {
      heading: '6. Customer (Controller) responsibilities',
      paragraphs: [
        'Customer is solely responsible for:',
      ],
      bullets: [
        'Establishing a lawful basis for processing and providing required notices to data subjects.',
        'Configuring RAGSuite projects, retention practices, allowed domains, and which LLM/embedding providers receive prompts and retrieved chunks.',
        'Not instructing Processor to process special-category data (Art. 9 GDPR) or children’s data unless a separate written schedule is agreed.',
        'Ensuring crawled/uploaded/connected content is lawfully obtainable and appropriate for AI retrieval.',
        'Assessing international transfer risks when enabling non-EU hosted model APIs.',
      ],
    },
    {
      heading: '7. Sub-processors',
      paragraphs: [
        'Customer authorises Processor to engage sub-processors in the categories listed in the Sub-processors tab (Annex III), including Customer-configured model providers when Customer supplies API keys or selects hosted models.',
        'Processor shall impose data-protection obligations on sub-processors no less protective than those in this DPA, to the extent applicable. Processor remains responsible for sub-processor performance where Processor engages them; where Customer contracts directly with a model provider using Customer’s own account/keys, that provider’s terms govern that relationship and Customer remains responsible for that choice.',
        'Processor will maintain an up-to-date category list in-product. Material changes to Processor-engaged sub-processors will be communicated with a reasonable objection window (commonly 14–30 days) where Processor operates a multi-tenant cloud offering. Self-hosted deployments are controlled by Customer’s own infrastructure choices.',
      ],
    },
    {
      heading: '8. International transfers',
      paragraphs: [
        'Where Customer Content is transferred outside the EEA/UK/Swiss territories, parties shall ensure an appropriate transfer mechanism (e.g. EU Standard Contractual Clauses). Self-hosted RAGSuite keeps application data on Customer infrastructure; optional calls to non-EU LLM APIs initiated by Customer configuration constitute transfers under Customer’s responsibility unless otherwise agreed.',
      ],
    },
    {
      heading: '9. Security incidents',
      paragraphs: [
        'Processor shall notify Customer without undue delay after becoming aware of a personal data breach affecting Customer Content, and provide information reasonably required for Customer to meet Art. 33/34 obligations. Target operational notification window for confirmed breaches: as soon as practicable and typically within 72 hours of confirmation, subject to investigation constraints.',
      ],
    },
    {
      heading: '10. Audits',
      paragraphs: [
        'Upon reasonable written notice, Processor shall make available information demonstrating compliance with this DPA. On-site audits are limited to once per year (unless a material breach is suspected), conducted during business hours, under confidentiality, and without compromising other customers’ security. Customer may rely on third-party audit reports or questionnaires where available.',
      ],
    },
    {
      heading: '11. Deletion and return',
      paragraphs: [
        'Customer may delete conversations, documents, projects, and related configuration via product features. Upon termination, Processor (for managed services) or Customer operators (for self-host) shall delete or return Customer Content in accordance with the main agreement. Vector indexes derived from Customer Content are included in deletion scope when the underlying sources/projects are purged.',
      ],
    },
    {
      heading: '12. Liability and precedence',
      paragraphs: [
        'Liability under this DPA follows the underlying licence or master service agreement between the parties, except where mandatory law provides otherwise. If there is a conflict between this DPA and other documents regarding personal data processing, this DPA prevails for processing terms.',
      ],
    },
    {
      heading: 'Annex I — Processing description (summary)',
      paragraphs: [
        'Chat (AI Assistant): user messages, assistant responses, session identifiers, optional feedback; retrieval of relevant document chunks; optional LLM completion.',
        'Search (AI Search): search queries, answers, citations/sources; same corpus and embedding stack as configured per project.',
        'Ingestion: crawl, upload, and connectors populate documents and Chroma (or configured) vectors.',
        'Auth & security: admin identity, sessions (IP/UA), audit events (IP/UA), API keys.',
        'Widgets/embeds: end-user queries via public embed credentials scoped to a project.',
      ],
    },
    {
      heading: 'Annex II — TOMs',
      paragraphs: [
        'Technical and organisational measures are described in the Security (TOMs) tab of this Trust Center and form part of this DPA by reference.',
      ],
    },
    {
      heading: 'Annex III — Sub-processors',
      paragraphs: [
        'Sub-processor categories and Customer-chosen providers are described in the Sub-processors tab and form part of this DPA by reference.',
      ],
    },
    {
      heading: 'Execution',
      paragraphs: [
        'Controller signatory: [CONTROLLER_SIGNATORY_NAME]. This template must be customised and executed (or incorporated by reference into an order form) before it constitutes a binding DPA. Version ' +
          TRUST_CENTER_VERSION +
          ', last updated ' +
          TRUST_CENTER_UPDATED_AT +
          '.',
      ],
    },
  ],
};
