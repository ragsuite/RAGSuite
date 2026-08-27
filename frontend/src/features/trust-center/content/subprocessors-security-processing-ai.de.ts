import type { TrustDocument } from '@/features/trust-center/content/types';
import { TRUST_CENTER_UPDATED_AT, TRUST_CENTER_VERSION } from '@/features/trust-center/content/types';

export const subprocessorsDe: TrustDocument = {
  id: 'subprocessors',
  title: 'Unterauftragsverarbeiter',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: 'Hinweise zur Liste',
      paragraphs: [
        'RAGSuite ist modell- und infrastrukturagnostisch. Welche Organisationen personenbezogene Daten verarbeiten, hängt von Deployment und aktivierten Anbietern ab. Diese Liste beschreibt Kategorien und enthält keine kundenspezifischen Tenant-URLs.',
        'Vom Kunden gewählte LLM-/Embedding-Anbieter (eigene API-Schlüssel) werden durch Ihre Konfiguration eingebunden. Prüfen Sie deren AVV gesondert.',
      ],
    },
    {
      heading: 'Kategorie A — Kundeninfrastruktur (Self-Host / Air-Gap)',
      paragraphs: ['Bei Self-Host typischerweise unter Ihrer Kontrolle:'],
      bullets: [
        'Compute-/Container-Hosts.',
        'PostgreSQL, Redis, ChromaDB (oder Äquivalente).',
        'Reverse Proxies, TLS, Backups und Log-Aggregation.',
        'Lokale Modelle via Ollama oder OpenAI-kompatible Endpunkte im eigenen Perimeter.',
      ],
    },
    {
      heading: 'Kategorie B — Optionale gehostete Modell-/Embedding-Anbieter',
      paragraphs: [
        'Bei Auswahl eines gehosteten Anbieters können Prompts, Kontext und abgerufene Dokument-Chunks an dessen API gehen:',
      ],
      bullets: [
        'Frontier-APIs (Beispiele): OpenAI, Anthropic, Google Gemini, Azure OpenAI.',
        'EU-orientierte Anbieter (Beispiele): Mistral und weitere katalogisierte EU-APIs.',
        'Embedding-Modelle des gewählten Anbieters oder lokale Jina-/Ollama-Embeddings.',
      ],
    },
    {
      heading: 'Kategorie C — Optionale Connectors und Integrationen',
      paragraphs: ['Nur wenn vom Kunden verbunden:'],
      bullets: [
        'E-Mail-/Workspace-Connectors (z. B. Gmail).',
        'Task-/Wissens-Connectors (z. B. ClickUp).',
        'MCP und n8n (Beta) — Workflows nach Kundenkonfiguration.',
        'Outbound-Webhooks — vom Kunden definierte Ziele.',
      ],
    },
    {
      heading: 'Kategorie D — Kommunikation',
      paragraphs: [
        'Bei konfiguriertem SMTP kann E-Mail-Infrastruktur Admin-Benachrichtigungsadressen und Sicherheitsmails verarbeiten.',
      ],
    },
    {
      heading: 'Kategorie E — Produktanbieter (Managed Services)',
      paragraphs: [
        'Betreibt NITSAN/RAGSuite einen vertraglichen Managed Cloud, können zusätzliche Hosting-Unterauftragsverarbeiter gelten und werden in der kommerziellen Anlage offengelegt. Die Open-Source Community Edition telefoniert standardmäßig nicht nach Hause.',
      ],
    },
    {
      heading: 'Widerspruch und Aktualisierungen',
      paragraphs: [
        'Bei vom Auftragsverarbeiter eingesetzten Unterauftragsverarbeitern kann der Kunde aus berechtigten Datenschutzgründen innerhalb der AVV-Frist widersprechen. Self-Host-Kunden steuern Kategorien A/B/C direkt.',
      ],
    },
  ],
};

export const securityDe: TrustDocument = {
  id: 'security',
  title: 'Sicherheit — Technische und organisatorische Maßnahmen (TOM)',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: '1. Zweck',
      paragraphs: [
        'Diese TOM beschreiben Maßnahmen zum Schutz von Kundeninhalten gemäß Art. 32 DSGVO. Wirksamkeit hängt von korrektem Betrieb und Patch-Management ab — insbesondere im Self-Host.',
      ],
    },
    {
      heading: '2. Verschlüsselung und Geheimnisse',
      paragraphs: ['Maßnahmen umfassen:'],
      bullets: [
        'TLS für API- und Web-Verkehr in empfohlenen Deployments.',
        'Verschlüsselung von LLM-Anbieter-API-Schlüsseln at rest.',
        'Passwort-Hashing; optionale TOTP-/E-Mail-2FA.',
        'Produkt-API-Schlüssel als Geheimnisse behandeln.',
      ],
    },
    {
      heading: '3. Zugriffskontrolle und Isolation',
      paragraphs: [
        'Projektbezogene Konfiguration für Chatbot, Suche, Dokumente und Embeddings.',
        'Authentifizierung für die Admin-Konsole; Widgets mit projektbezogenen öffentlichen Credentials.',
        'Organisationsmitgliedschaften und Berechtigungen in lizenzierten Enterprise-Funktionen.',
        'Need-to-know für Betriebszugriffe (Self-Host: Kunde).',
      ],
    },
    {
      heading: '4. Integrität, Verfügbarkeit, Belastbarkeit',
      paragraphs: [
        'PostgreSQL als System of Record; Redis für kurzlebige Session-/Cache-Daten; Vektorspeicher für Embeddings.',
        'System-Health-Monitoring in der Community Edition.',
        'Backups und DR unter Kundenkontrolle im Self-Host.',
        'Hintergrundjob-Aufbewahrung gemäß Produktkonfiguration.',
      ],
    },
    {
      heading: '5. Protokollierung, Audit und Monitoring',
      paragraphs: [
        'Audit-Ereignisse können Akteur, Aktion, IP und User-Agent erfassen.',
        'Sitzungen können IP und User-Agent speichern.',
        'Community Edition: grundlegende Audit-Fähigkeiten; Enterprise kann Aufbewahrung/Export erweitern.',
        'Anwendungs-Logs vom Betreiber so konfigurieren, dass unnötige personenbezogene Daten minimiert werden.',
      ],
    },
    {
      heading: '6. Entwicklung und Lieferkette',
      paragraphs: [
        'Community-Edition-Quellcode ist öffentlich einsehbar (Apache 2.0).',
        'Abhängigkeits- und Container-Hygiene liegen im Self-Host beim Betreiber.',
        'Kein Produktzwang zu Telemetrie-Beacons; Netzwergegress in Air-Gap-Designs prüfbar.',
      ],
    },
    {
      heading: '7. Menschlicher Zugriff',
      paragraphs: [
        'Support-Zugriff auf Kundeninhalte (Managed Offerings) nur nach Need-to-know, unter Vertraulichkeit und typischerweise mit Kundenautorisierung.',
      ],
    },
    {
      heading: '8. Zertifizierungen',
      paragraphs: [
        'Dieses Trust-Center behauptet keine SOC-2-/ISO-Zertifikate, sofern nicht gesondert für ein Angebot veröffentlicht. Kunden können unabhängige Audits gemäß AVV verlangen.',
      ],
    },
  ],
};

export const processingDe: TrustDocument = {
  id: 'processing',
  title: 'Verarbeitungsverzeichnis und Aufbewahrung',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: 'Überblick',
      paragraphs: [
        'Das folgende Verzeichnis ordnet RAGSuite-Funktionen typischen Verarbeitungen zu. Aufbewahrung in der selbst gehosteten Community Edition liegt primär beim Kunden. Automatische EU-weite Löschung nicht annehmen, sofern nicht konfiguriert und verifiziert.',
      ],
    },
    {
      heading: 'AI Assistant (Chat)',
      paragraphs: [
        'Speichert: Nutzernachrichten, Antworten, Sitzungs-IDs, optionales Feedback, Zitationsmetadaten.',
        'Redis kann kurzlebigen Chat-Session-Status halten.',
        'Löschung: Unterhaltungs-/Projektlöschung; Redis-TTL für ephemeren Status.',
      ],
    },
    {
      heading: 'AI Search',
      paragraphs: [
        'Speichert: Suchanfragen, Antworten, Zitationen; ähnliche Persistenz wie Chat, unterschieden nach Typ/Modus.',
        'Query-Analytics kann Anfragetext mit Projekt-/Nutzer-/API-Key-Bezug behalten.',
        'Löschung: entsprechend Verlaufs-/Projektlöschung und Kundenrichtlinie.',
      ],
    },
    {
      heading: 'Dokumente, Crawl, Connectors, Vektoren',
      paragraphs: [
        'Speichert: Text-/Dateiinhalt, Titel, URLs, Connector-Payloads, Embeddings.',
        'Aufbewahrung: bis der Kunde Quellen/Dokumente/Projekte löscht und Vektoren bereinigt; gestagte Connector-Daten können produktspezifische Kurzfristen haben.',
      ],
    },
    {
      heading: 'Konten, Sitzungen, Audits',
      paragraphs: [
        'Admin-Nutzer: E-Mail, Credential-Hashes, optionale Profilfelder, 2FA.',
        'Sitzungen und E-Mail-Verifizierung: IP, User-Agent.',
        'Audit-Ereignisse: Akteur, Zusammenfassung, IP, User-Agent, Details.',
        'Aufbewahrung: bis Kontolöschung / Kundenrichtlinie; Enterprise ggf. längere Audit-Aufbewahrung.',
      ],
    },
    {
      heading: 'Integrationen',
      paragraphs: [
        'Embed-Skripte selbst sind keine personenbezogenen Daten; Laufzeitverkehr trägt Anfragen/Antworten.',
        'Webhooks/n8n können vom Kunden konfigurierte Payloads weiterleiten.',
        'Anbieter- und Produkt-API-Schlüssel sind vertrauliche Konfiguration.',
      ],
    },
    {
      heading: 'Betroffenenanfragen',
      paragraphs: [
        'Verantwortliche nutzen Produktlöschung/-export und kontaktieren bei Managed Offerings den Support. Unterstützung gemäß AVV.',
      ],
    },
  ],
};

export const aiDe: TrustDocument = {
  id: 'ai',
  title: 'KI-Transparenz',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: 'Was den Perimeter verlassen kann (optional)',
      paragraphs: [
        'Nutzt ein Projekt einen gehosteten Chat- oder Embedding-Anbieter, kann RAGSuite übermitteln:',
      ],
      bullets: [
        'Die aktuelle Nutzeranfrage (Chat oder Suche).',
        'Aktuelle Gesprächsverläufe zur Kontextualisierung.',
        'Abgerufene Dokument-Chunks (RAG-Kontext) — ggf. mit personenbezogenen Daten aus Ihrem Korpus.',
        'System-/Such-Prompts und Generierungsparameter.',
        'Für Embeddings: Text von Dokumenten oder Anfragen.',
      ],
    },
    {
      heading: 'Was lokal bleibt',
      paragraphs: [
        'Mit Ollama oder lokalen OpenAI-kompatiblen Endpunkten kann Inferenz vollständig auf Kundeninfrastruktur bleiben.',
        'Zitationen binden Antworten an Kundequellen.',
        'Community Edition erfordert keine Produkt-Telemetrie.',
      ],
    },
    {
      heading: 'Training',
      paragraphs: [
        'Politik für Kundeninhalte: keine Nutzung zum Training eigener Foundation Models des Auftragsverarbeiters. Trainingsregeln gehosteter Anbieter richten sich nach deren Vertrag — wählen Sie Business-Tarife mit AVV und No-Training, wo erforderlich.',
      ],
    },
    {
      heading: 'Menschliche Aufsicht',
      paragraphs: [
        'Feedback und Audit helfen der Qualitätssteuerung. Enterprise Compare Models und Deep Query Tracing (soweit lizenziert) unterstützen Bewertung ohne Änderung der DSGVO-Rollen.',
      ],
    },
    {
      heading: 'EU-AI-Act-Positionierung',
      paragraphs: [
        'RAGSuite betont Transparenz (Zitationen), Kontrolle (Self-Host, eigene Schlüssel) und Auditierbarkeit. Der Kunde bleibt für die Einordnung seines Use Cases und Risikobewertungen verantwortlich.',
      ],
    },
  ],
};
