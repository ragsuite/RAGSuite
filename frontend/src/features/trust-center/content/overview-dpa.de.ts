import type { TrustDocument } from '@/features/trust-center/content/types';
import { TRUST_CENTER_UPDATED_AT, TRUST_CENTER_VERSION } from '@/features/trust-center/content/types';

export const overviewDe: TrustDocument = {
  id: 'overview',
  title: 'Trust-Center — Überblick',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: 'Zur Prüfung gebaut',
      paragraphs: [
        'RAGSuite ist eine souveräne Enterprise-KI-Plattform für AI Search, AI Assistant und AI Connectors. Sie ist dafür ausgelegt, auf Ihrer Infrastruktur zu laufen — selbst gehostet, Private Cloud oder air-gapped — mit DSGVO by design und ohne Produkt-Telemetrie, die nach Hause telefoniert.',
        'Dieses Trust-Center richtet sich an einsetzende Kunden (Rechtsabteilung, DSB, Beschaffung). Es ersetzt nicht Ihre eigene Datenschutzerklärung gegenüber Endnutzern Ihres Website-Chatbots oder Ihrer Suche.',
        'Dieses Trust-Center veröffentlicht die rechtlichen und Transparenzdokumente, die EU-Kunden und Prüfer typischerweise anfordern: Auftragsverarbeitungsvertrag (AVV / DPA), Unterauftragsverarbeiter-Kategorien, technische und organisatorische Maßnahmen (TOM), ein Verarbeitungsverzeichnis sowie KI-Datenfluss-Transparenz.',
      ],
    },
    {
      heading: 'Rollen nach DSGVO',
      paragraphs: [
        'Nach der DSGVO hängen die Rollen davon ab, wer über Zwecke und Mittel der Verarbeitung entscheidet.',
      ],
      bullets: [
        'Kunde (Verantwortlicher): entscheidet, warum Endnutzer-Chat-/Suchanfragen und Dokumente verarbeitet werden.',
        'RAGSuite-Betreiber / NITSAN (Auftragsverarbeiter), wenn die Software als Managed Service oder unter Weisung bereitgestellt wird: verarbeitet personenbezogene Daten nur zur Erbringung von RAGSuite.',
        'Selbst gehostete Community Edition: Wenn Sie RAGSuite vollständig auf eigenen Systemen betreiben, bleiben Sie typischerweise Verantwortlicher. Ein AVV mit NITSAN ist nur erforderlich, wenn NITSAN Daten hostet oder im Rahmen eines Vertrags auf Ihre Umgebung zugreift.',
        'Unterauftragsverarbeiter: Hosting, LLM-/Embedding-Anbieter, E-Mail oder Connectors, die Sie aktivieren. Kunden-API-Schlüssel bedeuten, dass diese Anbieter Prompts/Chunks unter deren Bedingungen verarbeiten.',
      ],
    },
    {
      heading: 'So nutzen Sie diese Dokumente',
      paragraphs: [
        '1. Prüfen Sie jeden Reiter mit Ihrer Datenschutzberatung.',
        '2. Ersetzen Sie Platzhalter des Verantwortlichen (z. B. [CONTROLLER_LEGAL_NAME]), bevor Sie einen AVV gegenzeichnen.',
        '3. Exportieren Sie Markdown, PDF, Word, HTML oder Klartext für Beschaffung / Auditoren.',
        '4. Halten Sie die Unterauftragsverarbeiter-Liste an den tatsächlich aktivierten LLM-Anbietern und Connectors je Projekt ausgerichtet.',
      ],
    },
    {
      heading: 'Wichtiger Hinweis',
      paragraphs: [
        'Diese Unterlagen sind professionelle Transparenzvorlagen, abgestimmt auf das Produktverhalten von RAGSuite. Sie ersetzen keine Rechtsberatung, keinen gegengezeichneten Vertrag und keine kundenspezifischen Anlagen. UI-Texte sind kein unterzeichneter AVV, bis die Parteien ihn ausführen.',
      ],
    },
    {
      heading: 'Platzhalter im AVV',
      paragraphs: [
        'Ersetzen Sie die folgenden Token vor der Ausführung. Committen Sie keine kundenspezifischen URLs in das Open-Source-Repository.',
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

export const dpaDe: TrustDocument = {
  id: 'dpa',
  title: 'Auftragsverarbeitungsvertrag (AVV / DPA)',
  version: TRUST_CENTER_VERSION,
  updatedAt: TRUST_CENTER_UPDATED_AT,
  sections: [
    {
      heading: '1. Parteien und Rollen',
      paragraphs: [
        'Dieser Auftragsverarbeitungsvertrag („AVV“) ist Bestandteil der Vereinbarung zwischen [CONTROLLER_LEGAL_NAME], mit Sitz [CONTROLLER_ADDRESS] („Verantwortlicher“ / „Kunde“), und dem RAGSuite-Anbieter unter der Marke RAGSuite, einer Innovation von NITSAN („Auftragsverarbeiter“). Öffentliche Produktinformationen sind über die in den Branding-Einstellungen konfigurierte offizielle Website des Anbieters erreichbar.',
        'Datenschutz-Kontakt (Verantwortlicher): [CONTROLLER_CONTACT_EMAIL]. Wirksamkeitsdatum: [EFFECTIVE_DATE].',
        'Für Art. 28 DSGVO ist der Kunde Verantwortlicher für Kundeninhalte (nachstehend definiert). Der Auftragsverarbeiter verarbeitet Kundeninhalte nur auf dokumentierte Weisung des Kunden, sofern nicht Unions- oder Mitgliedstaatenrecht etwas anderes verlangt.',
      ],
    },
    {
      heading: '2. Gegenstand, Dauer und Art der Verarbeitung',
      paragraphs: [
        'Gegenstand: Bereitstellung der RAGSuite-Software und verwandter Leistungen für AI Search, AI Assistant (Chatbot), Dokument-/Crawl-/Connector-Ingestion, Embeddings, Zitationen, Feedback, Widgets, Admin-Konsole, Audit-Protokollierung und optionale Integrationen (Webhooks, n8n, MCP, E-Mail-Connectors).',
        'Dauer: Laufzeit der zugrunde liegenden Lizenz-/Servicevereinbarung zuzüglich etwaiger Nachlaufzeit für Löschung/Rückgabe.',
        'Art: Erhebung, Speicherung, Auslesen, Organisation, Strukturierung, Anpassung, Abfrage, Verwendung, Offenlegung durch Übermittlung (einschließlich an vom Kunden konfigurierte LLM-/Embedding-Anbieter), Einschränkung, Löschung und Vernichtung personenbezogener Daten, soweit zur Betriebsführung von RAGSuite erforderlich.',
        'Zweck: Bereitstellung zitierbarer Such- und Assistentenantworten auf Basis der Quellen des Kunden; Sicherung und Betrieb der Plattform; Unterstützung bei Compliance-Anfragen. Der Auftragsverarbeiter nutzt Kundeninhalte nicht zum Training eigener Foundation Models.',
      ],
    },
    {
      heading: '3. Kategorien betroffener Personen',
      paragraphs: [
        'Je nach Konfiguration des Kunden können Betroffene sein:',
      ],
      bullets: [
        'Endnutzer von Websites, Intranet oder Apps des Kunden, die AI-Search- oder AI-Assistant-Widgets nutzen.',
        'Mitarbeitende und Administratoren des Kunden mit Zugang zur RAGSuite-Konsole.',
        'Personen, deren Daten in gecrawlten Websites, hochgeladenen Dokumenten oder verbundenen Quellen vorkommen.',
      ],
    },
    {
      heading: '4. Arten personenbezogener Daten',
      paragraphs: [
        'Kundeninhalte können insbesondere umfassen:',
      ],
      bullets: [
        'Chat- und Suchanfragen, Antworten, Verlauf, Feedback-Texte und Bewertungen.',
        'Dokument- und Seiteninhalte (Upload, Crawl, Connectors), Metadaten und daraus abgeleitete Vektor-Embeddings.',
        'Admin-Kontodaten: Namen, E-Mail-Adressen, Authentifizierungsmetadaten, optionale Profilfelder.',
        'Sicherheitsdaten: IP-Adressen und User-Agents bei Sitzungen, E-Mail-Verifizierung und Audit-Ereignissen.',
        'Integrationsgeheimnisse und API-Schlüssel — vertraulich; Anbieter-Schlüssel werden verschlüsselt gespeichert.',
        'Technische Logs, die bei aktivierter Ausführlichkeit Anfragetexte enthalten können.',
      ],
    },
    {
      heading: '5. Weisungen und Pflichten des Auftragsverarbeiters',
      paragraphs: [
        'Der Auftragsverarbeiter verpflichtet sich insbesondere:',
      ],
      bullets: [
        'Kundeninhalte nur auf dokumentierte Weisung zu verarbeiten.',
        'Zur Vertraulichkeit verpflichtetes Personal einzusetzen.',
        'Geeignete TOM umzusetzen (siehe Reiter Sicherheit / TOM).',
        'Bedingungen für Unterauftragsverarbeiter einzuhalten.',
        'Den Kunden bei Betroffenenrechten angemessen zu unterstützen.',
        'Bei Sicherheit, Meldepflichten und Datenschutz-Folgenabschätzungen zu unterstützen.',
        'Nach Ende der Leistungen Kundeninhalte nach Wahl des Kunden zu löschen oder zurückzugeben.',
        'Informationen zur Nachweisbarkeit bereitzustellen und Audits nach Maßgabe des AVV zu gestatten.',
      ],
    },
    {
      heading: '6. Pflichten des Kunden (Verantwortlicher)',
      paragraphs: [
        'Der Kunde ist allein verantwortlich für:',
      ],
      bullets: [
        'Rechtsgrundlage und Informationspflichten gegenüber Betroffenen.',
        'Konfiguration von Projekten, Aufbewahrung, Domains und LLM-/Embedding-Anbietern.',
        'Keine Weisung zur Verarbeitung besonderer Kategorien (Art. 9) oder von Kinderdaten ohne gesonderte Anlage.',
        'Rechtmäßigkeit der gecrawlten/hochgeladenen/verbundenen Inhalte.',
        'Bewertung von Drittlandtransfers bei nicht-EU-Modell-APIs.',
      ],
    },
    {
      heading: '7. Unterauftragsverarbeitung',
      paragraphs: [
        'Der Kunde genehmigt Unterauftragsverarbeiter der im Reiter „Unterauftragsverarbeiter“ genannten Kategorien, einschließlich vom Kunden konfigurierter Modellanbieter.',
        'Der Auftragsverarbeiter legt Unterauftragsverarbeitern angemessene Datenschutzpflichten auf. Bei direkten Verträgen des Kunden mit Modellanbietern über eigene Schlüssel gelten deren Bedingungen; der Kunde bleibt für diese Wahl verantwortlich.',
        'Wesentliche Änderungen bei vom Auftragsverarbeiter eingesetzten Unterauftragsverarbeitern werden — bei Managed Offerings — mit angemessener Widerspruchsfrist kommuniziert. Self-Host-Deployments steuert der Kunde selbst.',
      ],
    },
    {
      heading: '8. Internationale Übermittlungen',
      paragraphs: [
        'Bei Übermittlungen außerhalb von EWR/UK/Schweiz sorgen die Parteien für einen geeigneten Transfermechanismus (z. B. EU-Standardvertragsklauseln). Self-Host hält Anwendungsdaten auf der Kundeninfrastruktur; optionale Aufrufe nicht-EU-LLM-APIs durch Kundenkonfiguration sind Übermittlungen in Verantwortung des Kunden, sofern nicht anders vereinbart.',
      ],
    },
    {
      heading: '9. Sicherheitsvorfälle',
      paragraphs: [
        'Der Auftragsverarbeiter meldet dem Kunden unverzüglich nach Kenntnis einer Verletzung des Schutzes personenbezogener Daten und stellt die für Art. 33/34 erforderlichen Informationen bereit. Operatives Ziel bei bestätigten Vorfällen: so bald wie praktikabel, typischerweise innerhalb von 72 Stunden nach Bestätigung.',
      ],
    },
    {
      heading: '10. Audits',
      paragraphs: [
        'Auf angemessene schriftliche Ankündigung stellt der Auftragsverarbeiter Informationen zum Nachweis der Einhaltung bereit. Vor-Ort-Audits höchstens einmal jährlich (außer bei Verdacht auf wesentliche Pflichtverletzung), während der Geschäftszeiten, unter Vertraulichkeit und ohne Beeinträchtigung der Sicherheit anderer Kunden.',
      ],
    },
    {
      heading: '11. Löschung und Rückgabe',
      paragraphs: [
        'Der Kunde kann Unterhaltungen, Dokumente und Projekte über Produktfunktionen löschen. Bei Beendigung löscht oder gibt der Auftragsverarbeiter (Managed Service) bzw. der Kundenbetrieb (Self-Host) Kundeninhalte gemäß Hauptvertrag zurück. Abgeleitete Vektorindizes gehören zum Löschungsumfang, wenn Quellen/Projekte bereinigt werden.',
      ],
    },
    {
      heading: '12. Haftung und Rangfolge',
      paragraphs: [
        'Die Haftung folgt der zugrunde liegenden Lizenz- oder Rahmenvereinbarung, soweit zwingendes Recht nichts anderes bestimmt. Bei Widersprüchen zur Verarbeitung personenbezogener Daten geht dieser AVV vor.',
      ],
    },
    {
      heading: 'Anlage I — Verarbeitungsbeschreibung (Kurzfassung)',
      paragraphs: [
        'Chat: Nutzernachrichten, Antworten, Sitzungs-IDs, optional Feedback; Abruf relevanter Chunks; optionale LLM-Vervollständigung.',
        'Suche: Suchanfragen, Antworten, Zitationen; gleicher Korpus/Embedding-Stack je Projekt.',
        'Ingestion: Crawl, Upload und Connectors speisen Dokumente und Vektoren.',
        'Auth & Sicherheit: Admin-Identität, Sitzungen (IP/UA), Audit-Ereignisse, API-Schlüssel.',
        'Widgets: Endnutzer-Anfragen über projektbezogene Embed-Credentials.',
      ],
    },
    {
      heading: 'Anlage II — TOM',
      paragraphs: [
        'Die technischen und organisatorischen Maßnahmen sind im Reiter „Sicherheit (TOM)“ beschrieben und Bestandteil dieses AVV.',
      ],
    },
    {
      heading: 'Anlage III — Unterauftragsverarbeiter',
      paragraphs: [
        'Kategorien und kundengewählte Anbieter sind im Reiter „Unterauftragsverarbeiter“ beschrieben und Bestandteil dieses AVV.',
      ],
    },
    {
      heading: 'Unterzeichnung',
      paragraphs: [
        'Unterzeichner Verantwortlicher: [CONTROLLER_SIGNATORY_NAME]. Diese Vorlage muss angepasst und ausgeführt (oder per Bestellformular einbezogen) werden, bevor sie einen verbindlichen AVV darstellt. Version ' +
          TRUST_CENTER_VERSION +
          ', zuletzt aktualisiert ' +
          TRUST_CENTER_UPDATED_AT +
          '.',
      ],
    },
  ],
};
