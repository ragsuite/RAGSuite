import { en } from "./en";

export const de: Record<string, string> = {
  ...en,
  "analytics.actions.export": "Exportieren",
  "analytics.actions.refresh": "Analysen aktualisieren",
  "analytics.chart.noDataForPeriod":
    "Für diesen Zeitraum liegen keine Daten vor",
  "analytics.charts.dailyQueries": "Tägliche Anfragen",
  "analytics.charts.hardQueries": "Schwierige Anfragen",
  "analytics.charts.popularQueries": "Beliebte Anfragen",
  "analytics.charts.responseLatency": "Antwortlatenz",
  "analytics.charts.sourceCoverage": "Quellenabdeckung",
  "analytics.charts.userSatisfaction": "Nutzerzufriedenheit",
  "analytics.description":
    "Verfolgen Sie Leistungsmetriken und Benutzerengagement",
  "analytics.empty.noData": "Keine Daten verfügbar",
  "analytics.error.loadFailed":
    "Analysedaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
  "analytics.export.a11y.dismiss": "Exportmenü schließen",
  "analytics.format.na": "k. A.",
  "analytics.hardQueries.attempts": "{{count}} Versuche",
  "analytics.hardQueries.avg": "Durchschn.",
  "analytics.hardQueries.avgLatency": "{{value}} durchschn",
  "analytics.hardQueries.description":
    "Anfragen mit niedriger Zufriedenheit, die Aufmerksamkeit erfordern",
  "analytics.hardQueries.empty":
    "Keine Daten zu schwierigen Anfragen verfügbar",
  "analytics.hardQueries.title": "Schwierige Anfragen",
  "analytics.latency": "Latenz",
  "analytics.latency.p50": "S. 50",
  "analytics.latency.p95": "S. 95",
  "analytics.metrics.avgLatencyP95.title": "Durchschnittliche Latenz (p95)",
  "analytics.metrics.dailyAverage.title": "Tagesdurchschnitt",
  "analytics.metrics.fromLastPeriod": "gegenüber dem letzten Zeitraum",
  "analytics.metrics.queriesPerDay": "Anfragen pro Tag",
  "analytics.metrics.satisfactionRate.title": "Zufriedenheitsrate",
  "analytics.metrics.totalQueries.title": "Gesamtanfragen",
  "analytics.popularQueries.count": "{{count}} Anfragen",
  "analytics.popularQueries.empty":
    "Keine Daten zu beliebten Anfragen verfügbar",
  "analytics.queries": "Anfragen",
  "analytics.satisfaction": "Zufriedenheit",
  "analytics.satisfaction.label": "{{value}}% Zufriedenheit",
  "analytics.sources": "Quellen",
  "analytics.timeRange.last30Days": "Letzte 30 Tage",
  "analytics.timeRange.last3Months": "Letzte 3 Monate",
  "analytics.timeRange.last7Days": "Letzte 7 Tage",
  "analytics.title": "Analytik",
  "analytics.toast.export.error.description":
    "Analysedaten konnten nicht exportiert werden. Bitte versuchen Sie es erneut.",
  "analytics.toast.export.error.title": "Export fehlgeschlagen",
  "analytics.toast.export.success.description":
    "Analysedaten wurden erfolgreich exportiert.",
  "analytics.toast.export.success.title": "Export erfolgreich",
  "analytics.toast.refresh.error.description":
    "Analysedaten konnten nicht aktualisiert werden. Bitte versuchen Sie es erneut.",
  "analytics.toast.refresh.error.title": "Aktualisierung fehlgeschlagen",
  "analytics.toast.refresh.success.description":
    "Analysedaten wurden aktualisiert.",
  "analytics.toast.refresh.success.title": "Daten aktualisiert",
  "analytics.units.ms": "MS",
  "analytics.units.s": "S",
  "api-keys.a11y.copyKey": "API-Schlüssel kopieren",
  "api-keys.a11y.deleteKey": "{{name}} löschen",
  "api-keys.a11y.hideKey": "API-Schlüssel ausblenden",
  "api-keys.a11y.revealKey": "API-Schlüssel enthüllen",
  "api-keys.actions": "Aktionen",
  "api-keys.copy": "Kopieren",
  "api-keys.create": "API-Schlüssel erstellen",
  "api-keys.created": "Erstellt",
  "api-keys.curl.a11y.copyButton": "Curl-Befehl kopieren",
  "api-keys.curl.a11y.snippet": "API-Curl-Befehlsausschnitt",
  "api-keys.curl.copied": "Curl-Befehl in die Zwischenablage kopiert",
  "api-keys.curl.copiedShort": "cURL-Befehl kopiert.",
  "api-keys.curl.copyFailed": "Der cURL-Befehl konnte nicht kopiert werden.",
  "api-keys.curl.description":
    "Verwenden Sie Retrieve für die N8N-Automatisierung (nur Chunks). Verwenden Sie die Suche nach vollständigen RAG-Antworten.",
  "api-keys.curl.retrieve": "Abrufen (n8n)",
  "api-keys.curl.search": "Suche (vollständiges RAG)",
  "api-keys.curl.title": "Curl-Befehl",
  "api-keys.delete.descriptionWithName":
    "Dadurch wird „{{name}}“ dauerhaft widerrufen. Anwendungen, die diesen Schlüssel verwenden, verlieren den Zugriff.",
  "api-keys.delete.fallbackDescription":
    "Dies kann nicht rückgängig gemacht werden.",
  "api-keys.delete.title": "API-Schlüssel löschen?",
  "api-keys.description": "Verwalten Sie Ihre API-Schlüssel und Zugriffstoken",
  "api-keys.dialog.alert":
    "Bewahren Sie diesen Schlüssel sicher auf. Aus Sicherheitsgründen können Sie es nicht erneut ansehen.",
  "api-keys.dialog.description":
    "Ihr neuer API-Schlüssel wurde generiert. Kopieren Sie es jetzt – Sie können es dann nicht mehr sehen.",
  "api-keys.dialog.title": "API-Schlüssel erstellt",
  "api-keys.empty.description":
    "Erstellen Sie Ihren ersten API-Schlüssel, um mit der Nutzung der API zu beginnen.",
  "api-keys.empty.title": "Noch keine API-Schlüssel",
  "api-keys.environment": "Umfeld",
  "api-keys.environment.development": "Entwicklung",
  "api-keys.environment.production": "Produktion",
  "api-keys.environment.staging": "Inszenierung",
  "api-keys.expiration.1y": "1 Jahr",
  "api-keys.expiration.30d": "30 Tage",
  "api-keys.expiration.90d": "90 Tage",
  "api-keys.expiration.never": "Läuft nie ab",
  "api-keys.form.descriptionA11y": "Beschreibung des API-Schlüssels",
  "api-keys.form.descriptionOptional": "Beschreibung (optional)",
  "api-keys.form.descriptionPlaceholder":
    "Wofür wird dieser Schlüssel verwendet?",
  "api-keys.form.expiration": "Ablauf",
  "api-keys.form.namePlaceholder": "z. B. Produktion n8n",
  "api-keys.hide": "Ausblenden",
  "api-keys.key": "Schlüssel",
  "api-keys.key.hidden": "Versteckt",
  "api-keys.lastUsed": "Zuletzt verwendet",
  "api-keys.rateLimit": "Ratenbegrenzung",
  "api-keys.rateLimit.perHour": "{{value}}/Stunde",
  "api-keys.rateLimit.requestsPerHour": "{{value}} Anfragen/Stunde",
  "api-keys.requests": "Anfragen",
  "api-keys.revoke": "Widerrufen",
  "api-keys.show": "Anzeigen",
  "api-keys.title": "API-Schlüssel",
  "api-keys.toast.clipboardUnavailable.description":
    "Ihr Browser erlaubt das Kopieren in die Zwischenablage dieser Seite nicht. Bitte kopieren Sie den Schlüssel manuell.",
  "api-keys.toast.clipboardUnavailable.title": "Zwischenablage nicht verfügbar",
  "api-keys.toast.copied.description":
    "Der API-Schlüssel wurde in die Zwischenablage kopiert.",
  "api-keys.toast.copied.title": "Kopiert",
  "api-keys.toast.copiedShort": "API-Schlüssel kopiert.",
  "api-keys.toast.copyBlocked.description":
    "Bitte geben Sie zuerst den Schlüssel preis.",
  "api-keys.toast.copyBlocked.title": "Kann nicht kopiert werden",
  "api-keys.toast.copyFailed": "Der API-Schlüssel konnte nicht kopiert werden.",
  "api-keys.toast.createFailed.description":
    "Beim Erstellen des API-Schlüssels ist ein Fehler aufgetreten.",
  "api-keys.toast.createFailed.title":
    "API-Schlüssel konnte nicht erstellt werden",
  "api-keys.toast.loadFailed.description":
    "Beim Laden der API-Schlüssel ist ein Fehler aufgetreten.",
  "api-keys.toast.loadFailed.title":
    "API-Schlüssel konnten nicht geladen werden",
  "api-keys.toast.revealFailed.description":
    "Dieser API-Schlüssel kann nicht erneut angezeigt werden.",
  "api-keys.toast.revealFailed.title": "Schlüssel kann nicht angezeigt werden",
  "api-keys.toast.revoked.description":
    "The API key has been revoked successfully.",
  "api-keys.toast.revoked.title": "API Key Revoked",
  "api-keys.toast.revokeFailed.description":
    "API-Schlüssel konnte nicht widerrufen werden. Bitte versuchen Sie es erneut.",
  "api-keys.toast.validation.description":
    "Bitte überprüfen Sie das Formular: {{details}}",
  "api-keys.toast.validation.title": "Validierungsfehler",
  "app.about.description":
    "RAGSuite unterstützt Teams bei der Bereitstellung intelligenter Such-, Chat- und Analyse-Workflows mit starker Governance und schneller Iteration.",
  "app.about.productSubtitle":
    "Souveräne Abruf- und Konversations-KI auf Ihrer Infrastruktur.",
  "app.about.subtitle": "Produkt- und Versionsinformationen",
  "app.about.title": "Über uns",
  "app.licenses.sectionSubtitle":
    "In der mobilen Anwendung verwendete Kernbibliotheken.",
  "app.licenses.sectionTitle": "Open-Source-Lizenzen",
  "app.licenses.subtitle": "Open-Source-Hinweise",
  "app.licenses.title": "Lizenzen",
  "app.settings.appVersion": "App-Version",
  "app.settings.legal": "Rechtliches & App",
  "app.settings.privacyPolicy": "Datenschutzrichtlinie",
  "app.settings.workspace": "Arbeitsplatz",
  "app.terms.body1":
    "Durch die Nutzung von RAGSuite erklären Sie sich damit einverstanden, die Plattform verantwortungsvoll zu nutzen, geltende Gesetze zu befolgen und die Vertraulichkeit Ihres Kontos zu wahren.",
  "app.terms.body2":
    "Die Teams sind für die in ihren Arbeitsbereich hochgeladenen Inhalte, die Zugriffsverwaltung und die Einhaltung interner und behördlicher Anforderungen verantwortlich.",
  "app.terms.footer":
    "Für die vollständigen rechtlichen Bedingungen wenden Sie sich bitte an support@ragsuite.ai.",
  "app.terms.sectionSubtitle":
    "Die Bedingungen, die die Nutzung der RAGSuite-Produkte und -Dienste regeln.",
  "app.terms.sectionTitle": "Nutzungsbedingungen",
  "app.terms.subtitle": "Rechtliche Bedingungen für die Nutzung der App",
  "app.terms.title": "Nutzungsbedingungen",
  "audit.col.action": "Aktion",
  "audit.col.actor": "Benutzer / Akteur",
  "audit.col.eventType": "Ereignistyp",
  "audit.col.project": "Projekt",
  "audit.col.resource": "Ressource",
  "audit.col.severity": "Schweregrad",
  "audit.col.timestamp": "Zeitstempel",
  "audit.description":
    "Sicherheits- und Betriebsaktivitäten für Ihre Projekte überprüfen.",
  "audit.detail.changes": "Änderungen",
  "audit.detail.device": "Gerät / User-Agent",
  "audit.detail.failureReason": "Fehlergrund",
  "audit.detail.ip": "IP-Adresse",
  "audit.detail.raw": "Vollständige Details",
  "audit.detail.title": "Ereignisdetails",
  "audit.empty": "Keine Audit-Ereignisse gefunden.",
  "audit.filter.account": "Konto",
  "audit.filter.activeProject": "Aktives Projekt",
  "audit.filter.all": "Alle",
  "audit.filter.allProjects": "Alle Projekte",
  "audit.filter.category": "Kategorie",
  "audit.filter.project": "Projekt",
  "audit.filter.severity": "Schweregrad",
  "audit.loading": "Wird geladen…",
  "audit.loadMore": "Mehr laden",
  "audit.scope.account":
    "Zeigt Kontoebene-Ereignisse (Anmeldung, Passwort, 2FA, Sitzungen), einschließlich fehlgeschlagener Anmeldungen.",
  "audit.scope.activeProject":
    "Zeigt „{{name}}“-Workspace-Ereignisse plus Ihre Kontosicherheitsereignisse (Anmeldung, Passwort, 2FA, Sitzungen).",
  "audit.scope.allProjects":
    "Zeigt Ereignisse über alle Ihre Projekte, einschließlich fehlgeschlagener Anmeldungen für Ihren Benutzernamen.",
  "audit.searchPlaceholder": "Ereignisse suchen…",
  "audit.title": "Audit-Protokolle & Compliance",
  "audit.toast.copied": "In die Zwischenablage kopiert",
  "audit.toast.copyFailed": "Kopieren fehlgeschlagen",
  "auth.form.signUp.title": "Konto erstellen",
  "chatbot.colors.blue": "Blau",
  "chatbot.colors.darkGray": "Dunkelgrau",
  "chatbot.colors.gradient": "Verlauf",
  "chatbot.colors.green": "Grün",
  "chatbot.colors.purple": "Violett",
  "chatbot.config.activeStatus.activeBadge": "Aktiv",
  "chatbot.config.activeStatus.activeDescription": "Chatbot ist derzeit aktiv",
  "chatbot.config.activeStatus.description":
    "Chatbot-Dienst aktivieren oder deaktivieren",
  "chatbot.config.activeStatus.inactiveDescription":
    "Chatbot ist derzeit inaktiv",
  "chatbot.config.activeStatus.label": "Chatbot-Status",
  "chatbot.config.activeStatus.loading": "Aktivierungsstatus wird geladen...",
  "chatbot.config.activeStatus.title": "Aktivstatus",
  "chatbot.config.activeStatus.updating": "Status wird aktualisiert...",
  "chatbot.config.bubbleMessageLabel": "Bubble-Nachricht",
  "chatbot.config.bubbleMessagePlaceholder": "Bubble-Nachricht",
  "chatbot.config.defaultBubbleMessage": "Bubble-Nachricht",
  "chatbot.config.defaultTitle": "RAGSuite-Demo",
  "chatbot.config.defaultWelcomeMessage": "Hallo, wie kann ich Ihnen helfen?",
  "chatbot.config.description":
    "Konfigurieren Sie die grundlegenden Einstellungen und das Verhalten Ihres Chatbots",
  "chatbot.config.feedbackEnabled.description":
    "Wenn deaktiviert, blendet der Chatbot Daumen, Bewertungen und schriftliches Feedback aus und speichert kein neues Feedback.",
  "chatbot.config.feedbackEnabled.label": "Nutzer-Feedback sammeln",
  "chatbot.config.languageLabel": "Chatbot-Sprache",
  "chatbot.config.loading": "Konfiguration wird geladen...",
  "chatbot.config.save": "Konfiguration speichern",
  "chatbot.config.saving": "Wird gespeichert...",
  "chatbot.config.title": "Konfiguration",
  "chatbot.config.titleLabel": "Chatbot-Titel",
  "chatbot.config.titlePlaceholder": "RAGSuite-Demo",
  "chatbot.config.unavailable":
    "Die Konfiguration des Chat-Widgets ist nicht verfügbar.",
  "chatbot.config.welcomeMessageLabel": "Willkommensnachricht",
  "chatbot.config.welcomeMessagePlaceholder":
    "Hallo, wie kann ich Ihnen helfen?",
  "chatbot.description":
    "Konfigurieren und verwalten Sie Training, Einstellungen und Integrationen Ihres Chatbots",
  "chatbot.domains.addButton": "Hinzufügen",
  "chatbot.domains.addButton.a11y": "URL hinzufügen",
  "chatbot.domains.addUrl.a11y": "Fügen Sie die zulässige URL hinzu",
  "chatbot.domains.addUrl.subtitle":
    "Geben Sie eine vollständige Website- oder Seiten-URL ein. Wir entfernen Hashes, ignorieren Abfrageparameter und normalisieren abschließende Schrägstriche.",
  "chatbot.domains.addUrl.title": "Fügen Sie die zulässige URL hinzu",
  "chatbot.domains.allowedUrls.title": "Erlaubte URLs",
  "chatbot.domains.description":
    "Konfigurieren Sie, welche Domains Ihr Chatbot-Widget verwenden dürfen",
  "chatbot.domains.empty.description":
    "Zulässige URLs sind erforderlich. Fügen Sie mindestens einen Eintrag hinzu, um Widgets zu aktivieren.",
  "chatbot.domains.empty.label": "Keine Zulassungsliste konfiguriert",
  "chatbot.domains.empty.subtitle":
    "Noch keine URLs konfiguriert. Fügen Sie mindestens einen Eintrag hinzu, damit Widgets funktionieren.",
  "chatbot.domains.entries": "{{count}} Einträge",
  "chatbot.domains.entry": "{{count}}-Eintrag",
  "chatbot.domains.loading": "Domänen werden geladen...",
  "chatbot.domains.remove.a11y": "{{domain}} entfernen",
  "chatbot.domains.scope.a11y": "URL-Bereich",
  "chatbot.domains.scope.entireSite": "Gesamte Website",
  "chatbot.domains.scope.pageAndSubpaths": "Seite + Unterpfade",
  "chatbot.domains.scope.pageOnly": "Nur diese Seite",
  "chatbot.domains.scopeLabel": "Umfang",
  "chatbot.domains.title": "Zugelassene Domains",
  "chatbot.domains.validation.a11y": "So funktioniert die Domänenvalidierung",
  "chatbot.domains.validation.bullet1":
    "Zulässige URLs sind erforderlich – Widgets funktionieren nur bei konfigurierten Einträgen.",
  "chatbot.domains.validation.bullet2":
    "Sie müssen mindestens eine URL hinzufügen, damit Widgets funktionieren.",
  "chatbot.domains.validation.bullet3":
    "URLs werden normalisiert (www entfernt, Pfade beibehalten, abschließende Schrägstriche gekürzt).",
  "chatbot.domains.validation.bullet4":
    "Nicht autorisierte Domänen erhalten den Fehler 403 Forbidden.",
  "chatbot.domains.validation.bullet5":
    "Die Domänenvalidierung gilt sowohl für Chatbots als auch für Such-Widgets.",
  "chatbot.domains.validation.bullet6":
    "Sie können eine ganze Site oder eine einzelne Seite (mit optionalen Unterpfaden) zulassen.",
  "chatbot.domains.validation.title": "So funktioniert die Domänenvalidierung:",
  "chatbot.embedding.reindex.button.idle": "Jetzt neu indizieren",
  "chatbot.embedding.reindex.button.running": "Wird neu indiziert …",
  "chatbot.embedding.reindex.failed.title": "Reindex fehlgeschlagen",
  "chatbot.embedding.reindex.lastRun.failed":
    "Letzte Neuindizierung fehlgeschlagen: {{detail}}",
  "chatbot.embedding.reindex.lastRun.incomplete":
    "Die letzte Neuindizierung wurde abgeschlossen, aber {{missing}} Elemente sind immer noch nicht eingebettet. Versuchen Sie es erneut.",
  "chatbot.embedding.reindex.partial.body":
    "{{embedded}}/{{total}} eingebettet; {{failed}} fehlgeschlagen.",
  "chatbot.embedding.reindex.partial.title": "Reindex mit Fehlern beendet",
  "chatbot.embedding.reindex.progress": "Reindex {{done}} / {{total}}",
  "chatbot.embedding.reindex.success.body":
    "{{embedded}}/{{total}} Dokument(e) mit dem aktiven Modell eingebettet.",
  "chatbot.embedding.reindex.success.title": "Reindex abgeschlossen",
  "chatbot.embedding.status.a11y": "Einbetten des Neuindizierungsstatus",
  "chatbot.embedding.status.allEmbedded.body":
    "{{count}} Vektoren für {{model}} gespeichert.",
  "chatbot.embedding.status.allEmbedded.title":
    "Alle Dokumente sind mit diesem Modell eingebettet",
  "chatbot.embedding.status.coverageSummary":
    "{{embedded}} von {{total}} Elementen eingebettet.",
  "chatbot.embedding.status.empty.body":
    "Dokumente hochladen oder Quelle crawlen. Sie werden mit {{model}} eingebettet.",
  "chatbot.embedding.status.empty.title": "Noch keine Dokumente",
  "chatbot.embedding.status.error.title":
    "Embedding-Status konnte nicht geladen werden",
  "chatbot.embedding.status.fallbackWarning":
    "Gespeicherte Einstellungen konnten Ihren API-Schlüssel nicht verwenden. Überprüfen Sie stattdessen das Standardmodell ({{model}}). Fügen Sie einen gültigen API-Schlüssel hinzu und speichern Sie erneut.",
  "chatbot.embedding.status.loadFailed":
    "Der Einbettungsstatus konnte nicht geladen werden",
  "chatbot.embedding.status.loading": "Embeddings werden geprüft …",
  "chatbot.embedding.status.needsReindex.body":
    "Es gibt {{total}} Dokument(e), die noch nicht mit {{model}} eingebettet sind. Reindex starten, um sie im Chat zu nutzen.",
  "chatbot.embedding.status.needsReindex.title":
    "Einige Dokumente sind nicht mit diesem Modell eingebettet",
  "chatbot.embedding.status.otherCollections":
    "{{count}} weitere Embedding(s) dieses Projekts enthalten noch ältere Vektoren.",
  "chatbot.embedding.status.refresh": "Aktualisieren",
  "chatbot.embedding.status.refreshA11y": "Einbettungsstatus aktualisieren",
  "chatbot.feedback.unavailable": "Feedback-Einstellungen nicht verfügbar.",
  "chatbot.history.citation.untitled": "Ohne Titel",
  "chatbot.history.confirm.deleteAll.message":
    "Dies entfernt dauerhaft den gesamten Chatverlauf. Dies kann nicht rückgängig gemacht werden.",
  "chatbot.history.confirm.deleteAll.title": "Alle Unterhaltungen löschen?",
  "chatbot.history.confirm.deleteOne.title": "Unterhaltung löschen?",
  "chatbot.history.confirm.deleteSelected.message":
    "{{count}} Unterhaltung(en) entfernen? Dies kann nicht rückgängig gemacht werden.",
  "chatbot.history.confirm.deleteSelected.title":
    "Ausgewählte Unterhaltungen löschen?",
  "chatbot.history.conversationCount": "{{count}} Gespräch",
  "chatbot.history.conversationNotFound": "Konversation nicht gefunden",
  "chatbot.history.conversationNotFoundDescription":
    "Möglicherweise wurde es gelöscht oder wird noch geladen.",
  "chatbot.history.conversationsCount": "{{count}} Gespräche",
  "chatbot.history.conversationTitle": "Gespräch",
  "chatbot.history.copyFailed": "Nachricht konnte nicht kopiert werden.",
  "chatbot.history.copyMessageA11y": "Nachricht kopieren",
  "chatbot.history.copySuccess": "Nachricht kopiert.",
  "chatbot.history.deleteAll": "Alle löschen",
  "chatbot.history.deleteAll.a11y": "Löschen Sie den gesamten Chatverlauf",
  "chatbot.history.deleteConversationA11y": "Konversation löschen",
  "chatbot.history.deleteSelected": "Ausgewählte löschen ({{count}})",
  "chatbot.history.deleteSelected.a11y":
    "Ausgewählte Konversationen löschen, {{count}}",
  "chatbot.history.description": "Chatverlauf anzeigen und filtern",
  "chatbot.history.empty": "Keine Unterhaltungen gefunden",
  "chatbot.history.filter.allTime": "Gesamte Zeit",
  "chatbot.history.filter.last30Days": "Letzte 30 Tage",
  "chatbot.history.filter.last7Days": "Letzte 7 Tage",
  "chatbot.history.filter.lastYear": "Letztes Jahr",
  "chatbot.history.filter.placeholder": "Nach Datum filtern",
  "chatbot.history.filter.today": "Heute",
  "chatbot.history.filterEmpty.body":
    "Versuchen Sie es mit einer anderen Suche oder einem anderen Zeitraum.",
  "chatbot.history.filterEmpty.title":
    "Keine Konversationen entsprechen Ihren Filtern.",
  "chatbot.history.filters": "Filter",
  "chatbot.history.filtersActive": "Filter, {{count}} aktiv",
  "chatbot.history.filtersHint": "Öffnet Zeitbereichsoptionen",
  "chatbot.history.loading": "Chatverlauf wird geladen...",
  "chatbot.history.mock.general": "Allgemein",
  "chatbot.history.mock.query1": "Was ist KI?",
  "chatbot.history.mock.query2": "Wie funktioniert maschinelles Lernen?",
  "chatbot.history.mock.query3": "Hilfe bei der Konfiguration",
  "chatbot.history.mock.response1": "KI steht für Künstliche Intelligenz...",
  "chatbot.history.mock.response2":
    "Maschinelles Lernen ist eine Teilmenge der KI...",
  "chatbot.history.mock.response3":
    "Ich kann Ihnen bei der Konfiguration helfen...",
  "chatbot.history.mock.support": "Unterstützung",
  "chatbot.history.mock.technical": "Technisch",
  "chatbot.history.search.a11y": "Gespräche durchsuchen",
  "chatbot.history.search.placeholder": "Unterhaltungen suchen...",
  "chatbot.history.selectAll": "Alle auswählen",
  "chatbot.history.selectAllVisible":
    "Wählen Sie alle sichtbaren Konversationen aus",
  "chatbot.history.selectConversation":
    "Wählen Sie eine Unterhaltung aus, um Nachrichten zu sehen",
  "chatbot.history.selectedCount": "{{count}} ausgewählt",
  "chatbot.history.sources": "Quellen",
  "chatbot.history.timeRange.label": "Zeitbereich",
  "chatbot.history.title": "Chatverlauf",
  "chatbot.history.user": "Benutzer",
  "chatbot.history.viewSource": "Quelle anzeigen →",
  "chatbot.history.viewSourceA11y": "Quelle ansehen {{title}}",
  "chatbot.integrations.copyFailed":
    "Snippet konnte nicht kopiert werden. Bitte versuchen Sie es erneut.",
  "chatbot.integrations.mobile.copy.description":
    "Mobile SDK-Code in die Zwischenablage kopiert",
  "chatbot.integrations.mobile.copy.title": "Kopiert",
  "chatbot.integrations.mobile.description":
    "Integrieren Sie das Chatbot-SDK in Ihre mobile App",
  "chatbot.integrations.mobile.instructions.configure":
    "Setzen Sie projectId, apiKey (rgs_live_…), endpoint und features",
  "chatbot.integrations.mobile.instructions.importInit":
    "Umschließen Sie Ihre App mit SafeAreaProvider und RAGSuiteProvider",
  "chatbot.integrations.mobile.instructions.install":
    "Expo: npx expo install @ragsuite/react-native react-native-safe-area-context expo-blur expo-linear-gradient expo-clipboard | CLI: npm install @ragsuite/react-native react-native-safe-area-context @react-native-community/blur react-native-linear-gradient @react-native-clipboard/clipboard",
  "chatbot.integrations.mobile.instructions.start":
    "Rendern Sie RAGSuiteChat innerhalb von RAGSuiteProvider",
  "chatbot.integrations.mobile.instructions.step1":
    "Installieren Sie das Mobile SDK in Ihrer Expo- oder Mobile-App (siehe Installationsbefehl unten).",
  "chatbot.integrations.mobile.instructions.step2":
    "Importieren Sie SafeAreaProvider und RAGSuiteProvider aus @ragsuite/react-native.",
  "chatbot.integrations.mobile.instructions.step3":
    "Setzen Sie projectId, apiKey (rgs_live_… unter Konfiguration → API-Schlüssel) und endpoint in RAGSuiteProvider.",
  "chatbot.integrations.mobile.instructions.step4":
    "Fügen Sie RAGSuiteChat in RAGSuiteProvider mit features={['chat']} hinzu.",
  "chatbot.integrations.mobile.instructions.step5":
    "Erstellen Sie die App neu und testen Sie auf einem Gerät oder Simulator — verwenden Sie nicht das Web-Embed-Token in mobilen Apps.",
  "chatbot.integrations.mobile.instructions.title": "Installationsanleitung:",
  "chatbot.integrations.mobile.regenerate": "Neu generieren",
  "chatbot.integrations.mobile.script.commentTitle": "Mobile SDK-Integration",
  "chatbot.integrations.mobile.scriptLabel": "Mobile SDK-Code",
  "chatbot.integrations.scripts.subtitle":
    "Kopieren Sie eingebettete Snippets für Web- und mobile Clients.",
  "chatbot.integrations.snippetUnavailable":
    "Integrationsausschnitt nicht verfügbar.",
  "chatbot.integrations.tabA11y": "Chatbot-Integrationen",
  "chatbot.integrations.web.copy.description":
    "Web-Skript in die Zwischenablage kopiert",
  "chatbot.integrations.web.copy.title": "Kopiert",
  "chatbot.integrations.web.description":
    "Binden Sie das Chatbot-Widget auf Ihrer Website ein",
  "chatbot.integrations.web.instructions.appear":
    "Das Chatbot-Widget wird auf Ihrer Seite angezeigt",
  "chatbot.integrations.web.instructions.copy": "Kopieren Sie das obige Skript",
  "chatbot.integrations.web.instructions.noteAfter":
    "dem Endpunkt bereitstellt",
  "chatbot.integrations.web.instructions.noteBefore":
    "Stellen Sie sicher, dass Ihr Backend so konfiguriert ist, dass es Widget-Dateien unter",
  "chatbot.integrations.web.instructions.noteLabel": "Hinweis:",
  "chatbot.integrations.web.instructions.pasteAfter": "Tag in Ihrem HTML ein",
  "chatbot.integrations.web.instructions.pasteBefore":
    "Fügen Sie es vor dem schließenden",
  "chatbot.integrations.web.instructions.refresh":
    "Speichern und aktualisieren Sie Ihre Website",
  "chatbot.integrations.web.instructions.replaceAfter":
    "durch Ihre tatsächliche Projekt-ID (automatisch ausgefüllt, wenn Sie ein aktives Projekt haben)",
  "chatbot.integrations.web.instructions.replaceBefore": "Ersetzen Sie",
  "chatbot.integrations.web.instructions.title": "Installationsanleitung:",
  "chatbot.integrations.web.regenerate.button": "Neu generieren",
  "chatbot.integrations.web.regenerate.description":
    "Neues Einbettungsskript mit aktuellen Einstellungen erstellt",
  "chatbot.integrations.web.regenerate.title": "Skript neu generiert",
  "chatbot.integrations.web.script.commentAdvanced":
    "Alternative: Erweiterte Konfiguration",
  "chatbot.integrations.web.script.commentPlacement":
    "Fügen Sie dieses Skript vor dem schließenden </body>-Tag ein",
  "chatbot.integrations.web.script.commentTitle": "RAG Suite Chatbot-Widget",
  "chatbot.integrations.web.script.sampleTitle": "KI-Assistent",
  "chatbot.integrations.web.script.sampleWelcome":
    "Hallo. Wie kann ich Ihnen helfen?",
  "chatbot.integrations.web.scriptLabel": "Web-Widget-Skript",
  "chatbot.integrations.web.title": "Web-Integration",
  "chatbot.languages.ar": "Arabisch",
  "chatbot.languages.de": "Deutsch",
  "chatbot.languages.en": "Englisch (US)",
  "chatbot.languages.enGb": "Englisch (UK)",
  "chatbot.languages.es": "Spanisch",
  "chatbot.languages.fr": "Französisch",
  "chatbot.languages.pt": "Portugiesisch (Brasilien)",
  "chatbot.languages.zh": "Chinesisch (vereinfacht)",
  "chatbot.models.apiKey.helper": "API-Schlüssel für den ausgewählten Anbieter",
  "chatbot.models.apiKey.label": "API-Schlüssel",
  "chatbot.models.apiKey.ollamaHelper":
    "Der API-Schlüssel wird für den Ollama-Anbieter automatisch gesetzt",
  "chatbot.models.apiKey.ollamaPlaceholder":
    "Für Ollama automatisch ausgefüllt",
  "chatbot.models.apiKey.placeholder": "API-Schlüssel eingeben",
  "chatbot.models.apiKey.savedPlaceholder":
    "Neuen Schlüssel eingeben zum Ersetzen",
  "chatbot.models.chatModel.helper": "Das Modell für Chat/Completion-Aufgaben",
  "chatbot.models.chatModel.label": "Chat-Modell",
  "chatbot.models.chatModel.noneAvailable": "Keine Modelle verfügbar",
  "chatbot.models.chatModel.placeholder": "Modell auswählen",
  "chatbot.models.chatModel.selectProvider": "Zuerst einen Anbieter auswählen",
  "chatbot.models.description":
    "Konfigurieren Sie KI-Modellanbieter und Modellauswahl",
  "chatbot.models.embeddingModel.helper": "Modell für Embeddings (optional)",
  "chatbot.models.embeddingModel.helperFallback":
    "Kein Modell ausgewählt — Jina (Standard) wird verwendet.",
  "chatbot.models.embeddingModel.label": "Embedding-Modell",
  "chatbot.models.embeddingModel.none": "Keine (optional)",
  "chatbot.models.embeddingModel.noneAvailable":
    "Keine Embedding-Modelle für diesen Anbieter verfügbar",
  "chatbot.models.embeddingModel.placeholder":
    "Embedding-Modell auswählen (optional)",
  "chatbot.models.embeddingModel.selectProvider":
    "Zuerst einen Anbieter auswählen",
  "chatbot.models.loading": "Modelleinstellungen werden geladen...",
  "chatbot.models.parameters.bestOf": "Das Beste von",
  "chatbot.models.parameters.frequencyPenalty": "Frequenzstrafe",
  "chatbot.models.parameters.frequencyPenaltyHint":
    "(chatgpt.openai_frequenz_penalty [Zeichenfolge])",
  "chatbot.models.parameters.frequencyPenaltyPlaceholder": "0,01",
  "chatbot.models.parameters.presencePenalty": "Anwesenheitsstrafe",
  "chatbot.models.parameters.presencePenaltyPlaceholder": "0,01",
  "chatbot.models.parameters.temperature": "Temperatur",
  "chatbot.models.parameters.temperatureHint": "(0–2, höher = kreativer)",
  "chatbot.models.parameters.temperaturePlaceholder": "0,7",
  "chatbot.models.parameters.topPHint": "(chatgpt.openai_top_p [Zeichenfolge])",
  "chatbot.models.parameters.topPPlaceholder": "0,01",
  "chatbot.models.provider.label": "Modellanbieter",
  "chatbot.models.provider.loading": "Anbieter werden geladen...",
  "chatbot.models.provider.placeholder": "Anbieter auswählen",
  "chatbot.models.rag.maxTokens": "Maximale Tokens",
  "chatbot.models.rag.maxTokensHelper":
    "Maximale Länge der generierten Antworten (Minimum: 50, Max: 3000)",
  "chatbot.models.rag.similarityThreshold": "Ähnlichkeitsschwelle",
  "chatbot.models.rag.similarityThresholdHelper":
    "Minimale Ähnlichkeitsbewertung für die Dokumentaufnahme",
  "chatbot.models.rag.topK": "Top-K-Ergebnisse",
  "chatbot.models.rag.topKHelper":
    "Anzahl der Blöcke, die pro Abfrage aus der Vektordatenbank abgerufen wurden",
  "chatbot.models.rag.useReranker": "Reranker verwenden",
  "chatbot.models.rag.useRerankerHelper":
    "Relevanz der Ergebnisse durch Reranking verbessern",
  "chatbot.models.save": "Modelleinstellungen speichern",
  "chatbot.models.title": "Modelleinstellungen",
  "chatbot.models.unavailable": "Modelleinstellungen nicht verfügbar.",
  "chatbot.primaryTab.a11y": "Registerkarte {{label}}",
  "chatbot.prompt.default": "Sie sind ein hilfreicher KI-Assistent...",
  "chatbot.prompt.defaultBadge":
    "Standard: Klicken Sie auf Speichern, um die benutzerdefinierte Eingabeaufforderung anzuwenden",
  "chatbot.prompt.description":
    "Passen Sie den System-Prompt Ihres Chatbots an",
  "chatbot.prompt.helper":
    "Dieser Prompt definiert das Verhalten und die Persönlichkeit des Chatbots",
  "chatbot.prompt.label": "System-Prompt",
  "chatbot.prompt.loading": "Prompt wird geladen...",
  "chatbot.prompt.placeholder": "Geben Sie Ihren System-Prompt ein...",
  "chatbot.prompt.save": "Prompt speichern",
  "chatbot.prompt.saving": "Wird gespeichert...",
  "chatbot.prompt.title": "Prompt bearbeiten",
  "chatbot.prompt.unsavedBadge": "Nicht gespeicherte Änderungen",
  "chatbot.screen.subtitle":
    "Trainieren Sie Ihren Index und konfigurieren Sie das Unternehmens-Chatbot-Widget.",
  "chatbot.settings.configShort": "Konfig",
  "chatbot.settings.configuration": "Konfiguration",
  "chatbot.settings.customisation": "Anpassung",
  "chatbot.settings.customShort": "Anpassung",
  "chatbot.settings.domains": "Zugelassene Domains",
  "chatbot.settings.domainsShort": "Domänen",
  "chatbot.settings.feedback": "Rückmeldung",
  "chatbot.settings.feedbackShort": "Rückmeldung",
  "chatbot.settings.models": "Modelleinstellungen",
  "chatbot.settings.modelsShort": "Modelle",
  "chatbot.settings.overview": "Übersicht",
  "chatbot.settings.preview.allowedDomains": "Zugelassene Domains",
  "chatbot.settings.preview.allowedUrls": "Zugelassene URLs:",
  "chatbot.settings.preview.allowlistLabel": "Zulassungsliste:",
  "chatbot.settings.preview.apiKeyLabel": "API-Schlüssel:",
  "chatbot.settings.preview.avatarSizeLabel": "Avatar-Größe:",
  "chatbot.settings.preview.chatbotConfig": "Chatbot-Konfig",
  "chatbot.settings.preview.configuredCount": "{{count}} konfiguriert",
  "chatbot.settings.preview.description":
    "Live-Vorschau aller Einstellungskonfigurationen",
  "chatbot.settings.preview.disabled": "Deaktiviert",
  "chatbot.settings.preview.embeddingModel": "Einbettung: {{model}}",
  "chatbot.settings.preview.enabled": "Ermöglicht",
  "chatbot.settings.preview.languageLabel": "Sprache:",
  "chatbot.settings.preview.models": "Modelle",
  "chatbot.settings.preview.moreCount": "+{{count}} weitere",
  "chatbot.settings.preview.noDomains": "Keine Domains konfiguriert",
  "chatbot.settings.preview.showDateTimeLabel": "Datum/Uhrzeit anzeigen:",
  "chatbot.settings.preview.showLogoLabel": "Logo anzeigen:",
  "chatbot.settings.preview.title": "Vorschau der Einstellungskonfiguration",
  "chatbot.settings.preview.titleLabel": "Titel:",
  "chatbot.settings.preview.unavailable":
    "Einstellungsübersicht nicht verfügbar.",
  "chatbot.settings.subtitle":
    "Konfigurieren Sie Modell, Widget, Domänen und Integrationen.",
  "chatbot.settings.title": "Einstellungen",
  "chatbot.tabs.integrations": "Integrationen",
  "chatbot.tabs.integrationsCompact": "Integrationen",
  "chatbot.tabs.settings": "Einstellungen",
  "chatbot.tabs.training": "Ausbildung",
  "chatbot.time.daysAgo": "vor {{count}} Tagen",
  "chatbot.time.hoursAgo": "vor {{count}} Std.",
  "chatbot.time.justNow": "gerade eben",
  "chatbot.time.minutesAgo": "vor {{count}} Min",
  "chatbot.time.monthsAgo": "vor {{count}} Monaten",
  "chatbot.time.unknown": "Unbekannt",
  "chatbot.time.yearsAgo": "vor {{count}} Jahren",
  "chatbot.title": "Chatbot-Konfiguration",
  "chatbot.toast.avatarUploaded.description":
    "Der benutzerdefinierte Avatar wird gespeichert, wenn Sie auf Speichern klicken.",
  "chatbot.toast.avatarUploaded.title":
    "Benutzerdefinierter Avatar hochgeladen",
  "chatbot.toast.deleteAll.description":
    "{{count}} Konversation(en) erfolgreich gelöscht.",
  "chatbot.toast.deleteAll.title": "Gelöscht",
  "chatbot.toast.deleteAllError.description":
    "Einige Konversationen konnten nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  "chatbot.toast.deleteAllError.title": "Fehler",
  "chatbot.toast.deleteConversation.description":
    "Konversation erfolgreich gelöscht.",
  "chatbot.toast.deleteConversation.title": "Gelöscht",
  "chatbot.toast.deleteConversationError.description":
    "Konversation konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  "chatbot.toast.deleteConversationError.title": "Fehler",
  "chatbot.toast.loadHistoryError.description":
    "Chatverlauf konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
  "chatbot.toast.loadHistoryError.title": "Fehler",
  "chatbot.toast.logoUploaded.description":
    "Das Widget-Logo wird gespeichert, wenn Sie auf Speichern klicken.",
  "chatbot.toast.logoUploaded.title": "Widget-Logo hochgeladen",
  "chatbot.toast.settingsSaved.description":
    "Ihre Chatbot-Einstellungen wurden erfolgreich gespeichert.",
  "chatbot.toast.settingsSaved.title": "Einstellungen gespeichert",
  "chatbot.training.activeConfig": "Aktive Konfiguration",
  "chatbot.training.activeConfig.subtitle":
    "Kontrollieren Sie, ob der Chatbot live ist, und bearbeiten Sie die Systemaufforderung.",
  "chatbot.training.activeConfig.unavailable":
    "Keine aktive Trainingskonfiguration.",
  "chatbot.training.activeStatus.active": "Aktiv",
  "chatbot.training.activeStatus.disabled": "Deaktiviert",
  "chatbot.training.activeStatus.enabled": "Aktiviert",
  "chatbot.training.activeStatus.inactive": "Inaktiv",
  "chatbot.training.activeStatus.live": "Chatbot ist live",
  "chatbot.training.activeStatus.offline": "Chatbot ist offline",
  "chatbot.training.activeStatus.statusLine": "Status: Chatbot ist {{status}}",
  "chatbot.training.activeStatus.title": "Aktivstatus",
  "chatbot.training.activeStatus.updating": "Wird aktualisiert...",
  "chatbot.training.chatHistory": "Chatverlauf",
  "chatbot.training.chatHistory.conversations": "{{count}} Unterhaltungen",
  "chatbot.training.chatHistory.filtered": "Gefiltert: {{filter}}",
  "chatbot.training.chatHistory.title": "Chatverlauf",
  "chatbot.training.chatHistory.total": "{{count}} gesamt",
  "chatbot.training.chatHistory.totalMessages": "Gesamtanzahl Nachrichten:",
  "chatbot.training.configShort": "Konfig",
  "chatbot.training.historyShort": "Verlauf",
  "chatbot.training.overview": "Übersicht",
  "chatbot.training.overview.unavailable":
    "Keine Trainingsübersicht verfügbar.",
  "chatbot.training.preview.description":
    "Live-Vorschau aller Trainingskonfigurationen",
  "chatbot.training.preview.title": "Vorschau der Trainingskonfiguration",
  "chatbot.training.prompt.chars": "{{count}} Zeichen",
  "chatbot.training.prompt.empty": "Kein Prompt gesetzt",
  "chatbot.training.prompt.emptyConfigured":
    "Noch keine Systemaufforderung konfiguriert.",
  "chatbot.training.prompt.length": "Länge:",
  "chatbot.training.prompt.loading": "Prompt wird geladen...",
  "chatbot.training.prompt.title": "System-Prompt",
  "chatbot.training.prompt.words": "Wörter:",
  "chatbot.training.subtitle":
    "Überwachen Sie die Indizierung, die aktive Konfiguration und den Chat-Verlauf.",
  "chatbot.training.title": "Ausbildung",
  "chatbot.widget.app.avatar.a11y": "Chat-Avatar",
  "chatbot.widget.app.clearConversation.a11y": "Klares Gespräch",
  "chatbot.widget.app.closeChat.a11y": "Chat schließen",
  "chatbot.widget.app.disclaimer": "KI kann Fehler machen — Antworten bitte prüfen.",
  "chatbot.widget.app.messageInput.a11y": "Chat-Nachricht",
  "chatbot.widget.app.messagePlaceholder": "Nachricht...",
  "chatbot.widget.app.sendMessage.a11y": "Nachricht senden",
  "chatbot.widget.app.sources.fallbackTitle": "Quelle {{index}}",
  "chatbot.widget.app.sources.noSnippet": "Kein Ausschnitt verfügbar",
  "chatbot.widget.app.sources.showAll": "Alle {{count}}-Quellen anzeigen",
  "chatbot.widget.app.sources.showLess": "Weniger anzeigen",
  "chatbot.widget.app.sources.toggle": "Quellen ({{count}})",
  "chatbot.widget.app.thumbsDown.a11y": "Daumen runter",
  "chatbot.widget.app.thumbsUp.a11y": "Daumen hoch",
  "chatbot.widget.avatar.customAlt": "Benutzerdefinierter Avatar",
  "chatbot.widget.avatar.customTitle": "Benutzerdefinierter Avatar",
  "chatbot.widget.avatar.empty": "Keine Avatare verfügbar",
  "chatbot.widget.avatar.removeCustom": "Benutzerdefinierten Avatar entfernen",
  "chatbot.widget.avatar.subtitle":
    "Wählen Sie einen voreingestellten Avatar oder laden Sie Ihr eigenes Bild hoch.",
  "chatbot.widget.colour.angle": "Winkel",
  "chatbot.widget.colour.applyGradient": "Verlauf anwenden",
  "chatbot.widget.colour.colour1": "Farbe 1",
  "chatbot.widget.colour.colour2": "Farbe 2",
  "chatbot.widget.colour.customGradient": "Benutzerdefinierter Verlauf",
  "chatbot.widget.colour.gradientColour1": "Verlaufsfarbe 1",
  "chatbot.widget.colour.gradientColour2": "Verlaufsfarbe 2",
  "chatbot.widget.colour.pickCustom": "Benutzerdefinierte Farbe wählen",
  "chatbot.widget.colour.subtitle":
    "Steuern Sie Markenfarben, Farbverlauf und Winkel.",
  "chatbot.widget.colour.title": "Chatbot-Farbe",
  "chatbot.widget.customisation.subtitle":
    "Verwalten Sie Widget-Branding, Farben, Optionen und Layout.",
  "chatbot.widget.customisation.unavailable": "Anpassung nicht verfügbar.",
  "chatbot.widget.feedback.cancel.a11y": "Feedback abbrechen",
  "chatbot.widget.feedback.characters": "{{current}}/{{max}} Zeichen",
  "chatbot.widget.feedback.close.a11y": "Feedback-Formular schließen",
  "chatbot.widget.feedback.comments.a11y": "Zusätzliche Feedback-Kommentare",
  "chatbot.widget.feedback.commentsOptional":
    "Zusätzliche Kommentare (optional)",
  "chatbot.widget.feedback.commentsPlaceholder":
    "Erzählen Sie uns mehr über Ihre Erfahrungen mit dieser Antwort ...",
  "chatbot.widget.feedback.dismiss.a11y": "Feedback ablehnen",
  "chatbot.widget.feedback.negative": "Negatives Feedback",
  "chatbot.widget.feedback.negativeEmoji": "👎 Negatives Feedback",
  "chatbot.widget.feedback.positive": "Positives Feedback",
  "chatbot.widget.feedback.positiveEmoji": "👍 Positives Feedback",
  "chatbot.widget.feedback.rate.a11y": "Bewerten Sie {{value}} von 5",
  "chatbot.widget.feedback.rating": "Bewertung",
  "chatbot.widget.feedback.reason.accurate": "Genau",
  "chatbot.widget.feedback.reason.clear": "Klar",
  "chatbot.widget.feedback.reason.complete": "Vollständig",
  "chatbot.widget.feedback.reason.fast_response": "Schnelle Reaktion",
  "chatbot.widget.feedback.reason.hallucinated": "Halluziniert",
  "chatbot.widget.feedback.reason.helpful": "Hilfreich",
  "chatbot.widget.feedback.reason.incorrect": "Falsch",
  "chatbot.widget.feedback.reason.low_quality": "Geringe Qualität",
  "chatbot.widget.feedback.reason.missing_sources": "Fehlende Quellen",
  "chatbot.widget.feedback.reason.outdated_information":
    "Veraltete Informationen",
  "chatbot.widget.feedback.reason.poor_formatting": "Schlechte Formatierung",
  "chatbot.widget.feedback.reason.slow_response": "Langsame Reaktion",
  "chatbot.widget.feedback.reason.too_technical": "Zu technisch",
  "chatbot.widget.feedback.reasonsOptional": "Gründe (optional)",
  "chatbot.widget.feedback.submit": "Geben Sie Feedback ab",
  "chatbot.widget.feedback.submit.a11y": "Geben Sie Feedback ab",
  "chatbot.widget.feedback.submitCompact": "Einreichen",
  "chatbot.widget.logo.chooseFile": "Datei auswählen",
  "chatbot.widget.logo.noFile": "Keine Datei ausgewählt",
  "chatbot.widget.logo.noFileSelected": "Keine Datei ausgewählt",
  "chatbot.widget.logo.preview": "Vorschau:",
  "chatbot.widget.logo.previewAlt": "Vorschau des Widget-Logos",
  "chatbot.widget.logo.subtitle":
    "Laden Sie Ihr Widget-Markenlogo hoch und zeigen Sie es in der Vorschau an.",
  "chatbot.widget.logo.title": "Logo hochladen",
  "chatbot.widget.options.showDateTime": "Datum & Uhrzeit anzeigen",
  "chatbot.widget.options.showBackdrop": "Hintergrund abdunkeln",
  "chatbot.widget.settings.panelCornerRadius": "Eckenradius des Panels: {{count}}px",
  "chatbot.widget.settings.customHeight": "Benutzerdefinierte Höhe",
  "chatbot.widget.settings.height": "Höhe: {{count}}px",
  "chatbot.widget.options.showLogo": "Logo anzeigen",
  "chatbot.widget.options.title": "Optionen",
  "chatbot.widget.position.left": "Links",
  "chatbot.widget.position.right": "Rechts",
  "chatbot.widget.position.title": "Chatbot-Position",
  "chatbot.widget.preview.a11y": "Live-Vorschau des Chat-Widgets",
  "chatbot.widget.preview.close": "Schließen",
  "chatbot.widget.preview.onSiteWidth": "Auf Ihrer Website: {{count}}px",
  "chatbot.widget.preview.open": "Offen",
  "chatbot.widget.preview.scaled": "Vorschau angepasst",
  "chatbot.widget.preview.subtitleInteractive":
    "Interaktive Widget-Chrome-Vorschau",
  "chatbot.widget.preview.subtitleScaled":
    "Auf Vorschaugröße skaliert ({{count}}px-Widget)",
  "chatbot.widget.preview.title": "Live-Vorschau",
  "chatbot.widget.save.label": "Widget-Anpassung speichern",
  "chatbot.widget.save.saving": "Speichern...",
  "chatbot.widget.settings.avatarSize": "Avatar-Größe: {{count}}px",
  "chatbot.widget.settings.bottomSpace": "Widget-Abstand unten: {{count}}px",
  "chatbot.widget.settings.customWidth": "Benutzerdefinierte Breite",
  "chatbot.widget.settings.title": "Widget-Einstellungen",
  "chatbot.widget.settings.width": "Breite: {{count}}px",
  "chatbot.widget.theme.backgroundLabel": "Hintergrundfarbe",
  "chatbot.widget.theme.textColorLabel": "Textfarbe",
  "chatbot.widget.theme.title": "Chatbereich-Design",
  "commandPalette.actions.createSource.description":
    "Eine neue Website zum Crawlen hinzufügen",
  "commandPalette.actions.createSource.title": "Crawl-Quelle erstellen",
  "commandPalette.actions.uploadDocuments.description":
    "Dateien in die Dokumentbibliothek hochladen",
  "commandPalette.actions.uploadDocuments.title": "Dokumente hochladen",
  "commandPalette.empty": "Keine Ergebnisse gefunden.",
  "commandPalette.groups.actions": "Aktionen",
  "commandPalette.input.placeholder": "Befehl eingeben oder suchen...",
  "commandPalette.nav.compareModels.description":
    "Mehrere KI-Modelle nebeneinander vergleichen",
  "commandPalette.nav.compareModels.title": "Zum Modellvergleich",
  "commandPalette.nav.profile.description": "Ihre Kontoeinstellungen verwalten",
  "commandPalette.nav.profile.title": "Zum Profil",
  "commandPalette.nav.settings.description":
    "Organisationseinstellungen konfigurieren",
  "commandPalette.nav.settings.title": "Zu den Einstellungen",
  "commandPalette.nav.systemHealth.description":
    "Systemstatus und Gesundheit anzeigen",
  "commandPalette.nav.systemHealth.title": "Zur Systemgesundheit",
  "common.a11y.backToAuditLogs": "Zurück zu Audit-Protokollen",
  "common.a11y.backToChatbotConfig": "Zurück zur Chatbot-Konfiguration",
  "common.a11y.backToChatHistory": "Zurück zum Chat-Verlauf",
  "common.a11y.backToFeedback": "Zurück zu Feedback",
  "common.a11y.backToSearchConfig": "Zurück zur Suchkonfiguration",
  "common.a11y.backToSearchHistory": "Zurück zum Suchverlauf",
  "common.a11y.backToSettings": "Zurück zu den Einstellungen",
  "common.a11y.closeDialog": "Dialog schließen",
  "common.a11y.dismissDialog": "Dialog schließen",
  "common.a11y.dismissMenu": "Menü schließen",
  "common.a11y.goBack": "Geh zurück",
  "common.a11y.hint.backToAuditLogs":
    "Kehrt zur Überwachungsprotokollliste zurück.",
  "common.a11y.hint.backToChatbotConfig":
    "Öffnet die Hauptregisterkarte „Chatbot-Konfiguration“.",
  "common.a11y.hint.backToChatHistory": "Kehrt zur Chat-Verlaufsliste zurück.",
  "common.a11y.hint.backToFeedback": "Kehrt zur Feedbackliste zurück.",
  "common.a11y.hint.backToSearchConfig":
    "Öffnet die Hauptregisterkarte „Suchkonfiguration“.",
  "common.a11y.hint.backToSearchHistory": "Kehrt zur Suchverlaufsliste zurück.",
  "common.a11y.hint.backToSettings":
    "Öffnet die Hauptregisterkarte „Einstellungen“.",
  "common.a11y.hint.goBack": "Kehrt zum vorherigen Bildschirm zurück.",
  "common.a11y.loadingChatbotConfig": "Chatbot-Konfiguration wird geladen",
  "common.a11y.loadingChatHistory": "Chatverlauf wird geladen",
  "common.a11y.loadingConversations": "Gespräche werden geladen",
  "common.a11y.openMenu": "Menü öffnen",
  "common.actions": "Aktionen",
  "common.back": "Zurück",
  "common.cancel": "Abbrechen",
  "common.clear": "Löschen",
  "common.close": "Schließen",
  "common.color.apply": "Farbe auftragen",
  "common.color.hex": "Verhexen",
  "common.color.hexValue": "Hex-Farbwert",
  "common.color.hue": "Farbton",
  "common.color.openPicker": "Farbauswahl öffnen",
  "common.color.pick": "Farbe auswählen",
  "common.color.pickerSubtitle":
    "Ziehen Sie zur Feinabstimmung das Farbfeld oder den Farbtonregler.",
  "common.color.preset": "Voreingestellte Farbe {{color}}",
  "common.color.presets": "Voreinstellungen",
  "common.color.saturationBrightness": "Sättigung und Helligkeit",
  "common.color.selected": "Ausgewählte Farbe {{color}}",
  "common.copy": "Kopie",
  "common.copyFailed":
    "Konnte nicht kopiert werden. Bitte versuchen Sie es erneut.",
  "common.copySnippet": "Ausschnitt kopieren",
  "common.create": "Erstellen",
  "common.delete": "Löschen",
  "common.disabled": "Deaktiviert",
  "common.discard": "Verwerfen",
  "common.disconnect": "Trennen",
  "common.done": "Fertig",
  "common.edit": "Bearbeiten",
  "common.enabled": "Aktiviert",
  "common.error": "Fehler",
  "common.filter": "Filtern",
  "common.loading": "Laden...",
  "common.never": "Niemals",
  "common.next": "Weiter",
  "common.no": "Nein",
  "common.notSet": "Nicht festgelegt",
  "common.off": "AUS",
  "common.on": "EIN",
  "common.premiumWorkspace": "Enterprise-KI-Plattform",
  "common.previous": "Vorherige",
  "common.refresh": "Aktualisieren",
  "common.reset": "Zurücksetzen",
  "common.retry": "Erneut versuchen",
  "common.save": "Speichern",
  "common.saveChanges": "Änderungen speichern",
  "common.saveFailed":
    "Änderungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  "common.saveInProgress": "Speichern läuft bereits. Bitte warten.",
  "common.saving": "Wird gespeichert...",
  "common.search": "Suchen",
  "common.selectLanguage": "Sprache auswählen",
  "common.snippetCopied": "Ausschnitt kopiert",
  "common.success": "Erfolg",
  "common.swipeToReadSnippet":
    "Wischen Sie, um den vollständigen Ausschnitt zu lesen",
  "common.uploading": "Hochladen…",
  "common.yes": "Ja",
  "compareModels.confirm.deleteConfig.message":
    "Gespeicherte Konfiguration für {{provider}} / {{model}} entfernen?",
  "compareModels.confirm.deleteConfig.title": "Modellkonfiguration löschen",
  "compareModels.description":
    "Führen Sie eine Abfrage für alle gespeicherten Modelle durch und vergleichen Sie die Antworten nebeneinander.",
  "compareModels.empty.auto": "Keine Modelle zum Vergleich verfügbar.",
  "compareModels.empty.both":
    "Konfigurieren Sie Chat- und Suchmodelle zum Vergleichen.",
  "compareModels.empty.chat": "Konfigurieren Sie Chat-Modelle zum Vergleichen.",
  "compareModels.empty.noProject":
    "Wählen Sie ein Projekt aus, um Modelle zu vergleichen.",
  "compareModels.empty.search":
    "Konfigurieren Sie Suchmodelle zum Vergleichen.",
  "compareModels.error.generic": "Modellvergleich fehlgeschlagen.",
  "compareModels.errors.deleteConfigFailed":
    "Modellkonfiguration konnte nicht gelöscht werden.",
  "compareModels.errors.loadConfigsFailed":
    "Modellkonfigurationen konnten nicht geladen werden.",
  "compareModels.errors.updateConfigFailed":
    "Modellkonfiguration konnte nicht aktualisiert werden.",
  "compareModels.progress.running":
    "Abfrage über {{count}}-Modelle hinweg ausführen…",
  "compareModels.query.placeholder":
    "Stellen Sie eine Frage, um Modelle zu vergleichen …",
  "compareModels.query.submit": "Vergleichen",
  "compareModels.result.completionTokens": "Fertigstellung",
  "compareModels.result.score": "Punktzahl",
  "compareModels.result.totalTokens": "Gesamt",
  "compareModels.results.empty":
    "Keine Ergebnisse für die aktivierten Modelle.",
  "compareModels.results.listA11y": "Ergebnisse des Modellvergleichs",
  "compareModels.savedConfigs.close": "Schließen",
  "compareModels.savedConfigs.deleteA11y": "{{model}} löschen",
  "compareModels.savedConfigs.excluded": "Vom Vergleich ausgeschlossen",
  "compareModels.savedConfigs.included": "Im Vergleich enthalten",
  "compareModels.savedConfigs.manage": "Gespeicherte Modelle verwalten",
  "compareModels.savedConfigs.title": "Gespeicherte Modellkonfigurationen",
  "compareModels.savedConfigs.toggleA11y": "{{model}}-Vergleich umschalten",
  "compareModels.status.resultsFor":
    "Ergebnisse für: {{query}} – {{count}} Modell bereit",
  "compareModels.status.resultsForPlural":
    "Ergebnisse für: {{query}} – {{count}} Modelle bereit",
  "compareModels.title": "Vergleichen Sie Modelle",
  "configuration.description":
    "Verwalten Sie API-Schlüssel und externe Integrationen für Ihr Projekt.",
  "configuration.n8n.copyCurl": "cURL kopieren (Import in n8n)",
  "configuration.n8n.description":
    "Verbinden Sie n8n-Workflows mit Ragsuite, damit Ihre Automatisierungen Ihre Dokumente durchsuchen können.",
  "configuration.n8n.inboundHelp":
    "Verwenden Sie diese Werte in Ihrem n8n-HTTP-Anforderungsknoten. Wählen Sie Ihren Ragsuite-API-Schlüssel aus oder fügen Sie ihn ein, um einen sofort importierbaren cURL-Befehl zu erstellen.",
  "configuration.n8n.loadingTemplate": "Eingehende Vorlage wird geladen…",
  "configuration.n8n.pasteKeyLabel":
    "Oder fügen Sie den Ragsuite-API-Schlüssel (Bearer-Token) ein.",
  "configuration.n8n.refreshKeys": "Schlüssel aktualisieren",
  "configuration.n8n.selectSavedKey":
    "Wählen Sie einen gespeicherten API-Schlüssel aus",
  "configuration.n8n.testing": "Testen…",
  "configuration.n8n.testRetrieval": "Testabruf (Ragsuite)",
  "configuration.tabs.apiKeys": "API-Schlüssel",
  "configuration.title": "Konfiguration",
  "confluence.refresh": "Aktualisieren",
  "crawl.action.deleteDocument": "Dokument löschen",
  "crawl.action.documentActions": "Dokumentieren Sie Aktionen",
  "crawl.action.editDocument": "Dokument bearbeiten",
  "crawl.action.inspectDocument": "Dokument prüfen",
  "crawl.action.sourceActions": "Quellaktionen",
  "crawl.action.viewDocument": "Dokument ansehen",
  "crawl.addSource": "Quelle hinzufügen",
  "crawl.alert.crawlLimitReached.description":
    "Bis zu {{count}} Crawls laufen parallel. Weitere Crawls werden automatisch in die Warteschlange gestellt.",
  "crawl.alert.crawlLimitReached.title": "{{count}} Crawls laufen",
  "crawl.confirm.deleteDocument.message":
    "„{{name}}“ aus der Bibliothek entfernen?",
  "crawl.confirm.deleteDocument.messageFallback": "Dieses Dokument löschen?",
  "crawl.confirm.deleteDocument.title": "Dokument löschen",
  "crawl.confirm.deleteDocuments.messageMany":
    "{{count}} ausgewählte Dokumente aus der Bibliothek löschen?",
  "crawl.confirm.deleteDocuments.messageOne":
    "Das ausgewählte Dokument aus der Bibliothek löschen?",
  "crawl.confirm.deleteDocuments.title": "Dokumente löschen",
  "crawl.confirm.deleteSource.message":
    "„{{name}}“ und seine Crawling-Jobs löschen?",
  "crawl.confirm.deleteSource.messageFallback": "Diese Quelle löschen?",
  "crawl.confirm.deleteSource.title": "Quelle löschen",
  "crawl.description":
    "Konfigurieren und überwachen Sie Website-Crawling-Quellen",
  "crawl.domain.addSource": "Quelle hinzufügen",
  "crawl.domain.description": "Crawl-Quellen und Jobs verwalten",
  "crawl.domain.search.placeholder": "Quellen suchen...",
  "crawl.domain.tabs.sources": "Quellen",
  "crawl.error.loadFailed":
    "Crawling-Daten können nicht geladen werden. Bitte versuchen Sie es erneut.",
  "crawl.filters.cadence": "Frequenz",
  "crawl.filters.cadenceAll": "Alle Frequenzen",
  "crawl.filters.cadenceDaily": "Täglich",
  "crawl.filters.cadenceOnce": "Einmal",
  "crawl.filters.cadenceWeekly": "Wöchentlich",
  "crawl.filters.clear": "Filter löschen",
  "crawl.filters.statusActive": "Aktiv",
  "crawl.filters.statusAll": "Alle Status",
  "crawl.filters.statusError": "Fehler",
  "crawl.filters.statusInactive": "Inaktiv",
  "crawl.filters.statusPending": "Ausstehend",
  "crawl.form.addTitle": "Neue Crawl-Quelle hinzufügen",
  "crawl.form.allowPatterns.helper":
    "URL-Muster zum Einschließen (* für Platzhalter verwenden)",
  "crawl.form.allowPatterns.label": "Erlaubte Muster",
  "crawl.form.allowPatterns.placeholder": "/docs/* oder /api/*",
  "crawl.form.denyPatterns.helper": "URL-Muster zum Ausschließen",
  "crawl.form.denyPatterns.label": "Verweigerte Muster",
  "crawl.form.denyPatterns.placeholder": "/admin/* oder /private/*",
  "crawl.form.depth.label": "Crawl-Tiefe",
  "crawl.form.description":
    "Konfigurieren Sie eine neue Website- oder Dokumentationsquelle zum Crawlen und Indexieren.",
  "crawl.form.description.label": "Beschreibung (optional)",
  "crawl.form.description.placeholder": "Beschreiben Sie diese Quelle...",
  "crawl.form.editTitle": "Crawl-Quelle bearbeiten",
  "crawl.form.frequency.label": "Crawl-Frequenz",
  "crawl.form.headless.helper":
    "AN: Wartet, bis die Seite vollständig geladen ist. AUS: Schneller — für einfache Seiten, die das nicht brauchen.",
  "crawl.form.headless.label": "Headless-Browser-Modus",
  "crawl.form.name.label": "Quellenname",
  "crawl.form.name.placeholder": "z. B. Dokumentationsseite",
  "crawl.form.rescopeRootLinks.helper":
    "Einschalten, wenn der Crawl auf Docs- oder Hilfe-Seiten Seiten übersieht. Bei normalen Websites aus lassen.",
  "crawl.form.rescopeRootLinks.label": "Alle Seiten finden",
  "crawl.form.skipHeaderFooter.helper":
    "Verbessert die Qualität durch Entfernen von Navigation, Kopf-, Fuß- und Seitenleistentext.",
  "crawl.form.skipHeaderFooter.label": "Kopf- / Fußzeile überspringen",
  "crawl.form.submit.create": "Quelle erstellen",
  "crawl.form.submit.update": "Quelle aktualisieren",
  "crawl.form.url.helper":
    "Wenn Sie eine URL mit Pfad eingeben, erlauben Widgets standardmäßig nur diese Seite.",
  "crawl.form.url.label": "Website-URL",
  "crawl.form.url.placeholder": "https://docs.beispiel.de",
  "crawl.jobs.detail.closeA11y": "Jobdetails schließen",
  "crawl.jobs.detail.crawledUrls": "Gecrawlte URLs",
  "crawl.jobs.detail.embeddingCoverageWarning":
    "Einige aktive Einbettungsmodelle sind für diese Crawling-Quelle nicht indiziert.",
  "crawl.jobs.detail.failedUrls": "Fehlgeschlagene URLs",
  "crawl.jobs.detail.noCrawledUrls": "Es wurden keine URLs gecrawlt.",
  "crawl.jobs.detail.noFailedUrls": "Keine URLs fehlgeschlagen.",
  "crawl.jobs.detail.noSkippedUrls": "Keine URLs übersprungen.",
  "crawl.jobs.detail.skippedUrls": "Übersprungene URLs",
  "crawl.jobs.detail.stat.crawled": "Gekrochen",
  "crawl.jobs.detail.stat.failed": "Fehlgeschlagen",
  "crawl.jobs.detail.stat.skipped": "Übersprungen",
  "crawl.jobs.error.fallback":
    "Crawl fehlgeschlagen. Prüfen Sie die Jobdetails und versuchen Sie es erneut.",
  "crawl.jobs.foundOn": "Gefunden auf",
  "crawl.jobs.referrerFilter.noMatch":
    "Keine URLs passen zu diesem Referrer-Filter",
  "crawl.jobs.referrerFilter.placeholder": "Nach Referrer-Seite filtern…",
  "crawl.jobs.referrersMore": "+{{count}} weitere",
  "crawl.jobs.search.placeholder": "Jobs suchen...",
  "crawl.jobs.sortByReferrer": "Nach Referrer sortieren",
  "crawl.jobs.sortByUrl": "Nach URL sortieren",
  "crawl.jobs.status.completed": "Abgeschlossen",
  "crawl.jobs.status.failed": "Fehlgeschlagen",
  "crawl.jobs.status.pending": "Ausstehend",
  "crawl.jobs.status.running": "Läuft",
  "crawl.jobs.status.waiting": "Wartend",
  "crawl.search.filterHint": "Filtert die Liste unten während der Eingabe",
  "crawl.source.form.addPattern": "Hinzufügen",
  "crawl.source.form.allowEmptyCrawl": "Leeres Crawlen zulassen",
  "crawl.source.form.allowEmptyCrawlHelper":
    "Lassen Sie Crawling-Jobs erfolgreich abschließen, wenn keine Seiten erkannt werden.",
  "crawl.source.form.allowlist": "Zulassungslistenmuster",
  "crawl.source.form.allowlistHelper":
    "Einzubindende URL-Muster (verwenden Sie * für Platzhalter)",
  "crawl.source.form.cadence": "Kadenz",
  "crawl.source.form.createSource": "Quelle erstellen",
  "crawl.source.form.createSourceA11y": "Quelle erstellen",
  "crawl.source.form.denylist": "Denylist-Muster",
  "crawl.source.form.denylistHelper": "Auszuschließende URL-Muster",
  "crawl.source.form.denylistPlaceholder": "/admin/* oder /private/*",
  "crawl.source.form.depth": "Kriechtiefe",
  "crawl.source.form.description": "Beschreibung",
  "crawl.source.form.descriptionA11y": "Quellenbeschreibung",
  "crawl.source.form.descriptionOptional": "Beschreibung (optional)",
  "crawl.source.form.descriptionPlaceholder":
    "Optionale Beschreibung für diese Quelle",
  "crawl.source.form.headless": "Headless-Modus",
  "crawl.source.form.headlessOff": "Aus",
  "crawl.source.form.headlessOn": "An",
  "crawl.source.form.name": "Quellname",
  "crawl.source.form.namePlaceholder": "z. B. Dokumentationsseite",
  "crawl.source.form.patternPlaceholder": "z. B. /docs/*",
  "crawl.source.form.previewFailed":
    "Vorschau der URL fehlgeschlagen. Überprüfen Sie die Adresse und versuchen Sie es erneut.",
  "crawl.source.form.previewing": "Vorschau...",
  "crawl.source.form.previewUrl": "Vorschau-URL",
  "crawl.source.form.reachable": "Erreichbar",
  "crawl.source.form.skipHeaderFooter": "Kopf- und Fußzeile überspringen",
  "crawl.source.form.skipHeaderFooterHelper":
    "Verbessert die Qualität durch Entfernen von Navigations-, Kopf-, Fußzeilen- und Seitenleistentext.",
  "crawl.source.form.unreachable": "Unerreichbar",
  "crawl.source.form.updateSource": "Quelle aktualisieren",
  "crawl.source.form.updateSourceA11y": "Quelle aktualisieren",
  "crawl.source.form.url": "Website-URL",
  "crawl.source.form.urlHint":
    "Wenn Sie eine URL mit einem Pfad eingeben, erlauben Widgets standardmäßig nur diese Seite.",
  "crawl.source.form.urlPlaceholder": "https://docs.beispiel.de",
  "crawl.source.sheet.addTitle": "Neue Crawl-Quelle hinzufügen",
  "crawl.source.sheet.editTitle": "Crawl-Quelle bearbeiten",
  "crawl.source.sheet.subtitle":
    "Konfigurieren Sie eine neue Website oder Dokumentationsquelle für das Crawling und die Indexierung.",
  "crawl.sources": "Quellen",
  "crawl.start": "Crawl starten",
  "crawl.status.ready": "Bereit",
  "crawl.status.readyA11y": "Bereit für die Suche",
  "crawl.stop": "Crawl stoppen",
  "crawl.table.col.cadence": "Frequenz",
  "crawl.table.col.depth": "Tiefe",
  "crawl.table.col.headless": "Headless-Modus",
  "crawl.table.col.lastCrawl": "Letzter Crawl",
  "crawl.table.empty":
    "Keine Crawl-Quellen gefunden. Fügen Sie Ihre erste Quelle hinzu.",
  "crawl.table.loading": "Quellen werden geladen...",
  "crawl.table.never": "Nie",
  "crawl.table.noUrl": "Keine URL",
  "crawl.table.status.active": "Aktiv",
  "crawl.table.status.crawling": "Crawlt",
  "crawl.table.status.error": "Fehler",
  "crawl.table.status.failed": "Fehlgeschlagen",
  "crawl.table.status.inactive": "Inaktiv",
  "crawl.table.status.indexing": "Indexiert",
  "crawl.table.status.pending": "Ausstehend",
  "crawl.table.status.queued": "In Warteschlange",
  "crawl.table.status.ready": "Bereit",
  "crawl.table.status.running": "Läuft",
  "crawl.table.status.unknown": "Unbekannt",
  "crawl.table.status.waiting": "Wartend",
  "crawl.table.title": "Crawl-Quellen",
  "crawl.table.tooltip.alreadyRunning":
    "Für diese Quelle läuft bereits ein Crawl.",
  "crawl.table.tooltip.limitReached":
    "Sie können bis zu {{count}} Crawls gleichzeitig ausführen. Warten Sie, bis einer abgeschlossen ist.",
  "crawl.table.training.pending": "Ausstehend",
  "crawl.table.training.trained": "Trainiert",
  "crawl.table.unnamed": "Unbenannt",
  "crawl.tabs.document": "Dokument",
  "crawl.tabs.gmail": "Google Mail",
  "crawl.title": "Crawl-Verwaltung",
  "crawl.toast.crawlAlreadyRunning.description":
    "Für diese Quelle läuft bereits ein Crawl-Job oder ist in der Warteschlange.",
  "crawl.toast.crawlAlreadyRunning.title": "Bereits aktiv",
  "crawl.toast.crawlLimitReached.description":
    "Alle {{count}} Crawl-Slots sind belegt. Bitte versuchen Sie es später erneut. Details in Ihren Benachrichtigungen.",
  "crawl.toast.crawlLimitReached.title": "Crawl-Limit erreicht",
  "crawl.toast.crawlQueued.description":
    "Alle Crawl-Slots sind belegt. Ihr Crawl startet automatisch, sobald ein Slot frei wird.",
  "crawl.toast.crawlQueued.title": "Crawl in Warteschlange",
  "crawl.toast.crawlStarted.description": "Crawl-Job wurde gestartet",
  "crawl.toast.crawlStarted.title": "Crawl gestartet",
  "crawl.toast.crawlStartedShort": "Der Crawl hat begonnen",
  "crawl.toast.crawlStartFailed":
    "Crawl konnte nicht gestartet werden. Bitte versuchen Sie es erneut.",
  "crawl.toast.gmailRefreshed":
    "Gmail-Status, Posteingang und indizierte E-Mails wurden aktualisiert.",
  "crawl.toast.jobRefreshed": "Job aktualisiert",
  "crawl.toast.refreshed.documentDescription": "Dokumente wurden aktualisiert.",
  "crawl.toast.refreshed.domainDescription":
    "Crawl-Quellen wurden aktualisiert.",
  "crawl.toast.refreshed.title": "Daten aktualisiert",
  "crawl.toast.siteAdded.description": "Erfolgreich {{name}} hinzugefügt",
  "crawl.toast.siteAdded.title": "Quelle hinzugefügt",
  "crawl.toast.siteAddFailed":
    "Quelle konnte nicht hinzugefügt werden. Bitte versuchen Sie es erneut.",
  "crawl.toast.siteDeleted.description": "Quelle erfolgreich entfernt",
  "crawl.toast.siteDeleted.title": "Quelle gelöscht",
  "crawl.toast.siteDeleteFailed":
    "Quelle konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  "crawl.toast.siteUpdated.description":
    "Quellkonfiguration erfolgreich aktualisiert",
  "crawl.toast.siteUpdated.title": "Quelle aktualisiert",
  "crawl.toast.siteUpdateFailed":
    "Quelle konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut.",
  "crawl.toast.sourceAdded": "Quelle hinzugefügt",
  "crawl.toast.sourceDeleted": "Quelle gelöscht",
  "crawl.toast.sourceUpdated": "Quelle aktualisiert",
  "documents.a11y.openDocument": "Öffnen Sie {{name}}",
  "documents.a11y.selectDocument": "Wählen Sie {{name}}",
  "documents.avgChunks": "Durchschn. Chunks",
  "documents.bulk.clearSelection": "Auswahl aufheben",
  "documents.bulk.reindex": "Neu indexieren",
  "documents.bulk.selectAll": "Alle auswählen",
  "documents.bulk.selectedCountMany": "{{count}} Dokumente ausgewählt",
  "documents.bulk.selectedCountOne": "{{count}} Dokument ausgewählt",
  "documents.chunks": "{{count}} Abschnitte",
  "documents.coverage.missingBanner":
    "Das Dokument {{count}} muss für das aktive Einbettungsmodell neu indiziert werden.",
  "documents.coverage.missingBannerPlural":
    "{{count}} Dokumente müssen für das aktive Einbettungsmodell neu indiziert werden.",
  "documents.description":
    "Verwalten Sie Ihre indizierten Dokumente und Inhalte",
  "documents.details.checksum": "Prüfsumme",
  "documents.details.chunks": "Abschnitte",
  "documents.details.chunksCreated": "{{count}} Textabschnitte erstellt",
  "documents.details.closeA11y": "Dokumentdetails schließen",
  "documents.details.description":
    "Dokumentmetadaten und Verarbeitungsinformationen anzeigen",
  "documents.details.descriptionField": "Beschreibung",
  "documents.details.fileSize": "Dateigröße",
  "documents.details.language": "Sprache",
  "documents.details.lastIndexed": "Zuletzt indexiert",
  "documents.details.sourceDomain": "Quelldomain",
  "documents.details.sourceUrl": "Quell-URL",
  "documents.details.title": "Dokumentdetails",
  "documents.editSubtitle":
    "Dokumentdetails aktualisieren. Änderungen werden in der Datenbank angezeigt.",
  "documents.editTitle": "Dokument bearbeiten",
  "documents.embedding.currentModel": "aktuell",
  "documents.embedding.missingActive":
    "Nicht mit dem aktuellen Chat-Modell eingebettet",
  "documents.embedding.missingActiveA11y":
    "Fehlende aktive Einbettungsmodellabdeckung",
  "documents.embedding.missingActiveDetail":
    "Nicht mit dem aktiven Chat-Modell ({{provider}} / {{model}}) eingebettet. Neu indexieren, um es im Chat durchsuchbar zu machen.",
  "documents.embedding.modelsLabel": "Eingebettete Modelle",
  "documents.embedding.none": "Keine",
  "documents.empty.action": "Dokument hochladen",
  "documents.empty.default": "Keine Dokumente gefunden",
  "documents.empty.filter": "Keine Dokumente entsprechen Ihren Filtern.",
  "documents.empty.search":
    "Keine Dokumente gefunden, die Ihrer Suche entsprechen",
  "documents.empty.uploadHint":
    "Laden Sie PDFs oder Dokumente hoch, um sie zur Indizierung in die Warteschlange zu stellen.",
  "documents.fields.indexed": "Indexiert",
  "documents.fields.language": "Sprache",
  "documents.fields.size": "Größe",
  "documents.fields.source": "Quelle",
  "documents.fields.type": "Typ",
  "documents.filters.statusAll": "Alle Status",
  "documents.filters.type": "Typ",
  "documents.filters.typeAll": "Alle Typen",
  "documents.filters.typeDoc": "Unterlagen",
  "documents.form.descriptionOptional": "Beschreibung (optional)",
  "documents.form.descriptionPlaceholder":
    "Kurze Beschreibung des Dokumentinhalts...",
  "documents.form.sourceCollection": "Quellensammlung",
  "documents.form.sourceCollectionPlaceholder": "z. B. manuelle Uploads",
  "documents.form.titleOptional": "Titel (optional)",
  "documents.form.titlePlaceholder":
    "Dokumenttitel oder leer lassen, um den Dateinamen zu verwenden",
  "documents.indexSummary":
    "{{total}} Dateien · {{indexed}} indexiert · {{chunks}} Index-Chunks",
  "documents.indexSummaryEmpty":
    "Noch keine hochgeladenen Dateien. Laden Sie ein Dokument hoch, um Indexzahlen zu sehen.",
  "documents.indexSummaryVisible": "(zeige {{visible}} von {{total}})",
  "documents.inspector.chunkLabel": "Stück {{index}}",
  "documents.inspector.contentNotAvailable": "Inhaltsvorschau nicht verfügbar.",
  "documents.inspector.loadContent": "Inhalt laden",
  "documents.inspector.loadFailed":
    "Der Dokumentinhalt konnte nicht geladen werden.",
  "documents.inspector.loading": "Dokument wird geladen…",
  "documents.inspector.loadMore": "Mehr laden ({{loaded}} / {{total}})",
  "documents.inspector.noChunks":
    "Für dieses Dokument wurden keine Blöcke gefunden.",
  "documents.inspector.noChunksIndexed": "Noch keine Chunks indiziert.",
  "documents.inspector.open": "Offen",
  "documents.inspector.openExternal": "Von außen öffnen",
  "documents.inspector.previewInlineUnavailable":
    "Für diesen Dateityp ist keine Inline-Vorschau verfügbar. Verwenden Sie „Öffnen“, um die Ansicht extern anzuzeigen.",
  "documents.inspector.subtitle":
    "Untersuchen Sie extrahierte Inhalte und indizierte Blöcke.",
  "documents.inspector.tabChunks": "Brocken",
  "documents.inspector.tabChunksCount": "Brocken ({{count}})",
  "documents.inspector.tabContent": "Inhalt",
  "documents.inspector.title": "Dokumenteninspektor",
  "documents.list.column.document": "Dokumentieren",
  "documents.list.column.size": "Größe",
  "documents.list.column.typeStatus": "Typ/Status",
  "documents.loadFailed": "Dokumente konnten nicht geladen werden",
  "documents.loading": "Dokumente werden geladen...",
  "documents.newThisWeek": "Neu diese Woche",
  "documents.previewAlert":
    "Vorschau: {{title}} \n\nDie Dateivorschau wird geöffnet, wenn eine Dokument-URL verfügbar ist.",
  "documents.previewUnavailable":
    "Die Dokumentvorschau ist noch nicht verfügbar.",
  "documents.reindexButtonInProgress": "Neuindizierung …",
  "documents.reindexFailedSoFar": "({{count}} bisher fehlgeschlagen)",
  "documents.reindexInProgressBody":
    "Suche: {{searchDone}} / {{searchTotal}} · Chat: {{chatDone}} / {{chatTotal}}",
  "documents.reindexInProgressStarting":
    "Einbettungs-Neuindizierung für Suche und Chat wird gestartet …",
  "documents.reindexInProgressTitle": "Neuindizierung läuft",
  "documents.routePlaceholder":
    "Platzhalter für das Dokumentmodul mit Routen- und Navigationsverkabelung.",
  "documents.search": "Dokumente suchen...",
  "documents.status.error": "Fehler",
  "documents.status.extracting": "Extrahiere",
  "documents.status.indexed": "Indexiert",
  "documents.status.indexedForModel": "Indexiert",
  "documents.status.indexing": "Indiziere",
  "documents.status.processed": "Verarbeitet",
  "documents.status.processing": "In Bearbeitung",
  "documents.status.queued": "In Warteschlange",
  "documents.title": "Dokumente",
  "documents.toast.bulkDeleted.descriptionMany":
    "Erfolgreich {{count}} Dokumente gelöscht",
  "documents.toast.bulkDeleted.descriptionOne":
    "Erfolgreich {{count}} Dokument gelöscht",
  "documents.toast.bulkDeleted.title": "Dokumente gelöscht",
  "documents.toast.bulkDeletedCountMany": "{{count}} Dokumente gelöscht",
  "documents.toast.bulkDeletedCountOne": "Dokument gelöscht",
  "documents.toast.bulkDeleteFailed":
    "Einige Dokumente konnten nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  "documents.toast.deleted.description": "Dokument wurde erfolgreich entfernt",
  "documents.toast.deleted.title": "Dokument gelöscht",
  "documents.toast.deleteFailed":
    "Dokument konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  "documents.toast.opened": "Geöffnet {{title}}",
  "documents.toast.reindexComplete": "Dokumente neu indiziert",
  "documents.toast.reindexCompleteWithErrors":
    "Neuindizierung des Dokuments mit Fehlern abgeschlossen.",
  "documents.toast.reindexDocumentsComplete.description":
    "Die Einbettungsaktualisierung für Ihre Dokumente ist abgeschlossen.",
  "documents.toast.reindexDocumentsComplete.title": "Dokumente neu indexiert",
  "documents.toast.reindexDocumentsCompleteFailed.descriptionFallback":
    "Der Einbettungsauftrag meldete einen Fehler. Details finden Sie in den Such- oder Chatbot-Einstellungen.",
  "documents.toast.reindexDocumentsCompleteFailed.title":
    "Neuindexierung fehlgeschlagen",
  "documents.toast.reindexDocumentsCompletePartial.description":
    "{{failed}} Einbettungsschritte meldeten Fehler. Aktualisieren Sie die Liste und versuchen Sie es erneut.",
  "documents.toast.reindexDocumentsCompletePartial.descriptionGeneric":
    "Die Neuindexierung endete mit Fehlern. Aktualisieren Sie die Liste und versuchen Sie es erneut.",
  "documents.toast.reindexDocumentsCompletePartial.title":
    "Neuindexierung mit Problemen beendet",
  "documents.toast.reindexFailed":
    "Dokumente konnten nicht neu indexiert werden. Bitte versuchen Sie es erneut.",
  "documents.toast.reindexNoProject":
    "Wählen Sie ein Projekt, bevor Sie neu indizieren.",
  "documents.toast.reindexNoSelection":
    "Wählen Sie mindestens ein Dokument zum Neuindizieren.",
  "documents.toast.reindexProjectPartial.body":
    "Ein Modus wurde gestartet; das andere ist fehlgeschlagen: {{detail}}",
  "documents.toast.reindexProjectPartial.title":
    "Neuindexierung teilweise gestartet",
  "documents.toast.reindexProjectStarted.body":
    "Die Einbettungs-Neuindizierung läuft für Suche und Chat in diesem Projekt. Fortschritt in den Such- oder Chatbot-Einstellungen prüfen.",
  "documents.toast.reindexProjectStarted.bodyDocumentsOnly":
    "Neu-Einbettung von {{count}} ausgewählter hochgeladener Datei(en) (gecrawlte URLs bleiben unverändert). Fortschritt in den Such- oder Chatbot-Einstellungen prüfen.",
  "documents.toast.reindexProjectStarted.bodyFromDoc":
    "Die Einbettungs-Neuindizierung läuft für Suche und Chat in diesem Projekt (geöffnet von „{{title}}“).",
  "documents.toast.reindexProjectStarted.bodyFromDocDocumentsOnly":
    "Neu-Einbettung von {{count}} ausgewählter hochgeladener Datei(en) für dieses Projekt (geöffnet von „{{title}}“); gecrawlte URLs bleiben unverändert. Fortschritt in den Such- oder Chatbot-Einstellungen prüfen.",
  "documents.toast.reindexProjectStarted.bodySharedIndex":
    "Suche und Chat nutzen dasselbe Einbettungsmodell — eine Neuindizierung aktualisiert beides. Fortschritt in den Such- oder Chatbot-Einstellungen prüfen.",
  "documents.toast.reindexProjectStarted.bodySharedIndexDocumentsOnly":
    "Suche und Chat teilen ein Einbettungsmodell — eine Neuindizierung aktualisiert {{count}} ausgewählte hochgeladene Datei(en) (gecrawlte URLs unverändert). Fortschritt in den Such- oder Chatbot-Einstellungen prüfen.",
  "documents.toast.reindexProjectStarted.title": "Neuindexierung gestartet",
  "documents.toast.reindexStarted.descriptionMany":
    "Neuindexierung von {{count}} Dokumenten. Diese Funktion benötigt möglicherweise Backend-API-Unterstützung.",
  "documents.toast.reindexStarted.descriptionOne":
    "Neuindexierung von {{count}} Dokument. Diese Funktion benötigt möglicherweise Backend-API-Unterstützung.",
  "documents.toast.reindexStarted.descriptionTitle":
    "Neuindexierung von {{title}}",
  "documents.toast.reindexStarted.title": "Neuindexierung gestartet",
  "documents.toast.reindexStartedShort":
    "Die Neuindizierung des Dokuments wurde gestartet",
  "documents.toast.updated.description": "Änderungen erfolgreich gespeichert",
  "documents.toast.updated.title": "Dokument aktualisiert",
  "documents.toast.uploaded.description":
    "Dokumente wurden erfolgreich hochgeladen.",
  "documents.toast.uploaded.title": "Dokumente hochgeladen",
  "documents.total": "Gesamte Dokumente",
  "documents.totalSize": "Gesamtgröße",
  "documents.upload": "Dokument hochladen",
  "documents.upload.allSkipped":
    "Alle ausgewählten Dateien wurden übersprungen (nicht unterstützte Formate).",
  "documents.upload.alreadyInProgress": "Der Upload läuft bereits.",
  "documents.upload.chooseFileError":
    "Wählen Sie eine Datei zum Hochladen aus.",
  "documents.upload.chooseFiles": "Wählen Sie Dateien",
  "documents.upload.chooseFilesA11y": "Wählen Sie Dateien aus",
  "documents.upload.filesQueued": "{{count}}-Datei in der Warteschlange",
  "documents.upload.filesQueuedPlural":
    "{{count}} Dateien in der Warteschlange",
  "documents.upload.folderModeHint":
    "Ordnermodus: Liest alle Dateien rekursiv. Es werden nur PDF, DOC, DOCX, TXT, MD, HTML hochgeladen.",
  "documents.upload.readingFiles": "Dateien werden gelesen…",
  "documents.upload.selectFiles": "Wählen Sie Dateien aus",
  "documents.upload.selectFolder": "Wählen Sie Ordner aus",
  "documents.upload.skippedUnsupported":
    "· {{count}} übersprungen (nicht unterstützt)",
  "documents.upload.summaryAllFailed":
    "Alle {{total}}-Uploads sind fehlgeschlagen.",
  "documents.upload.summaryPartial":
    "{{succeeded}} von {{total}} hochgeladen; {{failed}} ist fehlgeschlagen.",
  "documents.upload.uploadAsFolder": "Als Ordner hochladen",
  "documents.upload.uploadAsFolderA11y": "Als Ordner hochladen",
  "documents.uploadButtonInProgress": "Hochladen {{done}} / {{total}}",
  "documents.uploadDialogDescription":
    "Laden Sie Dokumente hoch, um sie zu indexieren und für Suche und Chat verfügbar zu machen.",
  "documents.uploadDialogDescriptionActive":
    "Ein Upload läuft bereits. Sie können den Fortschritt unten oder auf der Registerkarte Dokumente verfolgen.",
  "documents.uploadFailedSoFar": "({{count}} bisher fehlgeschlagen)",
  "documents.uploadInProgressBody":
    "{{done}} von {{total}} Dateien abgeschlossen.",
  "documents.uploadInProgressTitle": "Upload läuft",
  "documents.uploadProgress":
    "{{done}} von {{total}} Dateien werden hochgeladen…",
  "documents.uploadProgressFailed": "({{count}} fehlgeschlagen)",
  "documents.uploadProgressShort":
    "Hochladen von {{done}}/{{total}}{{failed}}…",
  "documents.uploadTitle": "Dokumente hochladen",
  "documents.view.grid": "Rasteransicht",
  "documents.view.list": "Listenansicht",
  "documents.view.modeA11y": "Dokumentansichtsmodus",
  "drawer.appearance": "Erscheinungsbild",
  "drawer.language": "Sprache",
  "drawer.preferences": "Einstellungen",
  "empty.documents.cta.addSource": "Crawl-Quelle hinzufügen",
  "empty.documents.cta.upload": "Dokumente hochladen",
  "empty.documents.description":
    "Laden Sie Dokumente hoch oder konfigurieren Sie Crawling-Quellen, um loszulegen.",
  "empty.documents.title": "Keine Dokumente gefunden",
  "empty.feedback.cta": "Analytics anzeigen",
  "empty.feedback.description":
    "Benutzer-Feedback wird hier angezeigt, sobald Benutzer Ihren KI-Assistenten verwenden.",
  "empty.feedback.title": "Noch keine Rückmeldung",
  "empty.queries.cta": "Testen Sie eine Abfrage",
  "empty.queries.description":
    "Beginnen Sie mit der Nutzung Ihres RAG-Systems, um hier Abfrageanalysen anzuzeigen.",
  "empty.queries.title": "Noch keine Anfragen",
  "errors.api.invalidReindexResponse": "Ungültige Reindex-Antwort.",
  "errors.api.invalidResponse": "Ungültige Serverantwort.",
  "errors.api.saveAllowedDomainsFailed":
    "Speichern erlaubter Domains fehlgeschlagen: ungültige Antwort.",
  "errors.api.saveDomainsFailed":
    "Speichern der Domains fehlgeschlagen: ungültige Antwort.",
  "errors.apiKeys.invalidResponse": "Ungültige API-Schlüssel-Antwort.",
  "errors.apiKeys.revealFailed": "API-Schlüssel konnte nicht angezeigt werden.",
  "errors.auth.emailVerificationFailed": "E-Mail-Verifizierung fehlgeschlagen.",
  "errors.auth.invalidLoginResponse": "Ungültige Login-Antwort vom Server.",
  "errors.auth.invalidVerificationResponse":
    "Ungültige Authentifizierungs-Verifizierungsantwort.",
  "errors.auth.publicConfigFailed":
    "Öffentliche Auth-Konfiguration konnte nicht geladen werden.",
  "errors.auth.ssoHydrateFailed":
    "SSO-Anmeldung konnte nicht abgeschlossen werden.",
  "errors.auth.twoFactorTokenMissing":
    "Zwei-Faktor-Authentifizierung ist erforderlich, aber es wurde kein Verifizierungstoken zurückgegeben.",
  "errors.chat.emptyMessage": "Geben Sie eine Nachricht ein.",
  "errors.chat.emptyResponse": "Leere Antwort vom Chat-Dienst.",
  "errors.chat.emptyStreamResponse":
    "Der Chat-Server hat eine leere Antwort zurückgegeben. Bitte versuchen Sie es erneut.",
  "errors.chat.missingSession": "Chat-Sitzung für Feedback fehlt.",
  "errors.chat.streamNoBody": "Die Suchstream-Antwort enthielt keinen Body.",
  "errors.compare.emptyQuery":
    "Geben Sie eine Abfrage zum Vergleichen von Modellen ein.",
  "errors.compare.requestFailed": "Vergleichsanfrage fehlgeschlagen.",
  "errors.confluence.authUrlFailed":
    "Confluence-Autorisierungs-URL konnte nicht abgerufen werden.",
  "errors.crawl.jobNotFound": "Auftrag nicht gefunden.",
  "errors.crawl.jobStatusFailed": "Auftragsstatus konnte nicht geladen werden.",
  "errors.crawl.sourceNotFound": "Quelle nicht gefunden.",
  "errors.dev.error": "Fehler",
  "errors.documents.aiUnavailable":
    "Der KI-Dienst ist derzeit nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut.",
  "errors.documents.chooseFile": "Wählen Sie eine Datei zum Hochladen.",
  "errors.documents.contentTokenFailed":
    "Inhaltstoken konnte nicht abgerufen werden.",
  "errors.documents.fileTooLarge":
    "Diese Datei ist zu groß. Die maximal zulässige Größe beträgt 50 MB.",
  "errors.documents.loadContentFailed":
    "Dokumentinhalt konnte nicht geladen werden.",
  "errors.documents.uploadFailed": "Upload fehlgeschlagen.",
  "errors.documents.uploadQueueFull":
    "Die Upload-Warteschlange ist voll. Warten Sie, bis laufende Uploads abgeschlossen sind, und versuchen Sie es erneut.",
  "errors.domains.alreadyExists": "Domain existiert bereits",
  "errors.domains.invalidUrl": "Geben Sie eine gültige Domain oder URL ein.",
  "errors.domains.urlAlreadyAllowlisted":
    "Diese URL ist bereits auf der Zulassungsliste.",
  "errors.export.failed": "Export fehlgeschlagen.",
  "errors.feedback.invalidEntriesResponse":
    "Ungültige Feedback-Einträge-Antwort.",
  "errors.feedback.invalidSummaryResponse":
    "Ungültige Feedback-Zusammenfassungsantwort.",
  "errors.gmail.authUrlFailed":
    "Gmail-Autorisierungs-URL konnte nicht abgerufen werden.",
  "errors.gmail.authUrlUnsupported":
    "Gmail-Autorisierungs-URL kann nicht geöffnet werden.",
  "errors.googleDrive.authUrlFailed":
    "Google-Drive-Autorisierungs-URL konnte nicht abgerufen werden.",
  "errors.health.missingService":
    "Dienst „{{name}}“ fehlt in der Gesundheitsnutzlast",
  "errors.history.invalidMessageResponse":
    "Ungültige Chat-Nachrichten-Antwort.",
  "errors.history.invalidResponse": "Ungültige Chat-Verlaufsantwort.",
  "errors.network.noResponse":
    "Keine Antwort vom Server. Bitte überprüfen Sie Ihre Internetverbindung.",
  "errors.network.requestFailed": "Anfrage fehlgeschlagen.",
  "errors.network.uploadFailed": "Upload fehlgeschlagen.",
  "errors.notFound.cta.back": "Zurück",
  "errors.notFound.cta.home": "Zurück zum Dashboard",
  "errors.notFound.description":
    "Die gesuchte Seite existiert nicht oder wurde verschoben.",
  "errors.notFound.title": "Seite nicht gefunden",
  "errors.notion.authUrlFailed":
    "Notion-Autorisierungs-URL konnte nicht abgerufen werden.",
  "errors.onboarding.noTestAnswer":
    "Keine Antwort von der Testabfrage erhalten.",
  "errors.page.cta.retry": "Erneut versuchen",
  "errors.page.title": "Etwas ist schiefgelaufen",
  "errors.permission.cta.home": "Zurück zum Dashboard",
  "errors.permission.cta.retry": "Erneut versuchen",
  "errors.permission.description":
    "Sie haben keine Berechtigung für diese Ressource. Wenden Sie sich an Ihren Administrator, wenn Sie glauben, dass dies ein Fehler ist.",
  "errors.permission.title": "Zugriff verweigert",
  "errors.project.selectFirst": "Wählen Sie zuerst ein aktives Projekt.",
  "errors.projectRequired": "Wählen Sie zuerst ein aktives Projekt aus.",
  "errors.search.emptyQuery":
    "Geben Sie eine Abfrage zum Testen der Suche ein.",
  "errors.search.invalidHistoryResponse": "Ungültige Suchverlauf-Antwort.",
  "errors.search.invalidTestResponse": "Ungültige Suchtest-Antwort.",
  "errors.search.minQueryLength": "Bitte geben Sie mindestens 3 Zeichen ein",
  "errors.search.sessionUnavailable":
    "Suchsitzung nicht verfügbar. Führen Sie erneut einen Suchtest aus, bevor Sie Feedback senden.",
  "errors.search.streamFailed": "Suchstream fehlgeschlagen.",
  "errors.server.cta.home": "Zurück zum Dashboard",
  "errors.server.cta.reload": "Seite neu laden",
  "errors.server.description":
    "Wir haben technische Schwierigkeiten. Bitte versuchen Sie es in wenigen Augenblicken erneut.",
  "errors.server.title": "Etwas ist schiefgelaufen",
  "errors.sharepoint.authUrlFailed":
    "SharePoint-Autorisierungs-URL konnte nicht abgerufen werden.",
  "errors.slack.authUrlFailed":
    "Slack-Autorisierungs-URL konnte nicht abgerufen werden.",
  "feedback.description":
    "Überprüfen und analysieren Sie Benutzerfeedback zu KI-Antworten",
  "feedback.detail.subtitle": "Botschaft, Quellen und Moderation",
  "feedback.detail.title": "Feedbackdetails",
  "feedback.title": "Feedback-Moderation",
  "feedbackModeration.col.preview": "Antwortvorschau",
  "feedbackModeration.col.query": "Benutzerabfrage",
  "feedbackModeration.col.reasons": "Gründe",
  "feedbackModeration.col.vote": "Stimme",
  "feedbackModeration.description":
    "Überprüfen und analysieren Sie Benutzerfeedback zu KI-Antworten",
  "feedbackModeration.detail.answer": "Assistentenantwort",
  "feedbackModeration.detail.comment": "Kommentar",
  "feedbackModeration.detail.confidence": "Konfidenz",
  "feedbackModeration.detail.ids": "Ausweise",
  "feedbackModeration.detail.loadingAnswer":
    "Vollständige Antwort wird geladen…",
  "feedbackModeration.detail.messageId": "Nachricht",
  "feedbackModeration.detail.modelEmbedding": "Embedding-Modell",
  "feedbackModeration.detail.modelLlm": "Sprachmodell",
  "feedbackModeration.detail.models": "Modelle",
  "feedbackModeration.detail.noComment": "Kein schriftlicher Kommentar",
  "feedbackModeration.detail.partialPreview":
    "Vollständige Nachricht konnte nicht geladen werden. Gespeicherte Vorschau aus der Liste wird angezeigt.",
  "feedbackModeration.detail.query": "Benutzerabfrage",
  "feedbackModeration.detail.rating": "Bewertung",
  "feedbackModeration.detail.reasons": "Grund-Tags",
  "feedbackModeration.detail.responseTime": "Antwortzeit",
  "feedbackModeration.detail.section.conversation": "Nachrichteninhalt",
  "feedbackModeration.detail.section.moderation": "Mäßigung",
  "feedbackModeration.detail.sessionId": "Sitzung",
  "feedbackModeration.detail.sources": "Quellen",
  "feedbackModeration.detail.submittedAt": "Eingereicht",
  "feedbackModeration.detail.subtitle":
    "Zuerst Nachricht und Quellen, dann die Bewertung des Nutzers und Ihre Moderationsaktionen.",
  "feedbackModeration.detail.title": "Feedback-Details",
  "feedbackModeration.detail.userFeedback": "Nutzer-Feedback",
  "feedbackModeration.detail.vote": "Stimme",
  "feedbackModeration.detail.voteNegative": "Negativ",
  "feedbackModeration.detail.votePositive": "Positiv",
  "feedbackModeration.empty":
    "Noch keine Feedback-Einträge für dieses Projekt.",
  "feedbackModeration.export": "Exportieren",
  "feedbackModeration.exportCsv": "CSV herunterladen",
  "feedbackModeration.exportJson": "JSON herunterladen",
  "feedbackModeration.filter.allVotes": "Alle Stimmen",
  "feedbackModeration.filter.negative": "Nur negativ",
  "feedbackModeration.filter.positive": "Nur positiv",
  "feedbackModeration.flagged": "Markiert",
  "feedbackModeration.list.openDetails": "Feedback-Details öffnen",
  "feedbackModeration.loading": "Wird geladen…",
  "feedbackModeration.loadMore": "Mehr laden",
  "feedbackModeration.moderation.flag": "Antwort markieren",
  "feedbackModeration.moderation.flagReasonInput":
    "Warum ist diese Antwort markiert?",
  "feedbackModeration.moderation.flagReasonPlaceholder":
    "Markierungsgrund (optional)",
  "feedbackModeration.moderation.markReviewed": "Als überprüft markieren",
  "feedbackModeration.moderation.notes": "Interne Notizen",
  "feedbackModeration.moderation.notesA11y": "Hinweise zur internen Moderation",
  "feedbackModeration.moderation.notesPlaceholder":
    "Neue Notiz hinzufügen (ersetzt die gespeicherte Notiz beim Speichern)…",
  "feedbackModeration.moderation.save": "Moderation speichern",
  "feedbackModeration.moderation.savedEmpty":
    "Für diese Nachricht ist noch keine Moderation gespeichert.",
  "feedbackModeration.moderation.savedTitle": "Gespeicherte Moderation",
  "feedbackModeration.moderation.updateTitle": "Moderation aktualisieren",
  "feedbackModeration.reason.accuracy": "Genauigkeit",
  "feedbackModeration.reason.accurate": "Korrekt",
  "feedbackModeration.reason.clarity": "Klarheit",
  "feedbackModeration.reason.clear": "Klar",
  "feedbackModeration.reason.complete": "Vollständig",
  "feedbackModeration.reason.completeness": "Vollständigkeit",
  "feedbackModeration.reason.fast_response": "Schnelle Antwort",
  "feedbackModeration.reason.hallucinated": "Halluziniert",
  "feedbackModeration.reason.helpful": "Hilfreich",
  "feedbackModeration.reason.helpfulness": "Hilfsbereitschaft",
  "feedbackModeration.reason.incorrect": "Falsch",
  "feedbackModeration.reason.low_quality": "Geringe Qualität",
  "feedbackModeration.reason.missing_sources": "Fehlende Quellen",
  "feedbackModeration.reason.other": "Sonstiges",
  "feedbackModeration.reason.outdated_information": "Veraltete Informationen",
  "feedbackModeration.reason.poor_formatting": "Schlechte Formatierung",
  "feedbackModeration.reason.relevance": "Relevanz",
  "feedbackModeration.reason.slow_response": "Langsame Antwort",
  "feedbackModeration.reason.speed": "Geschwindigkeit",
  "feedbackModeration.reason.too_technical": "Zu technisch",
  "feedbackModeration.reviewed": "Überprüft",
  "feedbackModeration.searchPlaceholder": "Abfrage- oder Antworttext suchen…",
  "feedbackModeration.summary.avgMs": "Ø Antwortzeit (ms)",
  "feedbackModeration.summary.flagged": "Markiert",
  "feedbackModeration.summary.negativePct": "Negativ %",
  "feedbackModeration.summary.positivePct": "Positiv %",
  "feedbackModeration.summary.reviewed": "Überprüft",
  "feedbackModeration.summary.topNegativeReasons": "Häufigste negative Gründe",
  "feedbackModeration.summary.total": "Feedback gesamt",
  "feedbackModeration.summary.votes": "Stimmen",
  "feedbackModeration.table.subtitle":
    "Neueste zuerst. Jede Karte öffnet den vollständigen Thread, Quellen und das Moderationspanel.",
  "feedbackModeration.table.title": "Feedback-Einträge",
  "feedbackModeration.title": "Feedback-Moderation",
  "feedbackModeration.toast.exported": "Export gestartet",
  "feedbackModeration.toast.exportFailed": "Export fehlgeschlagen",
  "feedbackModeration.toast.saved":
    "Moderation für diese Nachricht in der Datenbank gespeichert",
  "feedbackModeration.toast.saveFailed":
    "Moderation konnte nicht gespeichert werden",
  "forgot-password.errors.emailRequired":
    "Bitte geben Sie Ihre E-Mail-Adresse ein",
  "forgot-password.errors.generic":
    "Etwas ist schief gelaufen. Bitte versuchen Sie es erneut.",
  "forgot-password.form.back": "Zurück zum Login",
  "forgot-password.form.email.label": "E-Mail-Adresse",
  "forgot-password.form.email.placeholder": "sie@beispiel.de",
  "forgot-password.form.submit": "Link zum Zurücksetzen senden",
  "forgot-password.form.submitting": "Link zum Zurücksetzen wird gesendet...",
  "forgot-password.form.subtitle":
    "Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen.",
  "forgot-password.form.title": "Passwort vergessen",
  "forgot-password.hero.description":
    "Geben Sie die mit Ihrem Konto verknüpfte E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts. Sie können jederzeit zur Anmeldeseite zurückkehren, sobald Sie bereit sind, sich erneut anzumelden.",
  "forgot-password.hero.title": "Setzen Sie Ihr Passwort sicher zurück",
  "forgot-password.success.sent":
    "Wenn für diese E-Mail ein Konto vorhanden ist, wurde ein Link zum Zurücksetzen des Passworts gesendet.",
  "gmail.actions.pauseAutoSync":
    "Pausieren Sie die automatische Synchronisierung",
  "gmail.actions.resumeAutoSync":
    "Setzen Sie die automatische Synchronisierung fort",
  "gmail.actions.syncNow": "Jetzt synchronisieren",
  "gmail.confirm.disconnectMessage":
    "Gmail trennen? Indizierte Gmail-E-Mails und Posteingangsvorschauen werden aus diesem Projekt entfernt.",
  "gmail.confirm.disconnectTitle": "Gmail trennen?",
  "gmail.connect.description":
    "Fügen Sie Ihre Google OAuth-App-Anmeldeinformationen für dieses Projekt hinzu und verbinden Sie dann Ihr Gmail-Konto.",
  "gmail.connect.subtitle":
    "Nur für dieses Projekt sicher im Backend gespeichert",
  "gmail.connect.title": "Verbinden Sie Ihr Gmail",
  "gmail.description":
    "Verbinden Sie Gmail, um hier Posteingangsnachrichten abzurufen. Wählen Sie aus, welche E-Mails für den Chatbot indiziert werden sollen.",
  "gmail.error.banner":
    "Bei der Integration ist ein Fehler aufgetreten. Versuchen Sie, die Verbindung wiederherzustellen.",
  "gmail.form.clientId": "Google-Client-ID",
  "gmail.form.clientSecret": "Google-Client-Geheimnis",
  "gmail.form.connectGmail": "Gmail verbinden",
  "gmail.form.copyRedirectA11y": "Umleitungs-URI kopieren",
  "gmail.form.redirectUri": "Umleitungs-URI",
  "gmail.form.redirectUriHint":
    "Fügen Sie genau diese URL unter OAuth → Autorisierte Weiterleitungs-URIs hinzu.",
  "gmail.form.resetRedirectA11y": "Umleitungs-URI zurücksetzen",
  "gmail.form.saveBeforeConnect":
    "Speichern Sie Ihre Anmeldeinformationen, bevor Sie Gmail verbinden.",
  "gmail.form.saveCredentials": "Anmeldeinformationen speichern",
  "gmail.form.selectProject": "Wählen Sie zunächst ein aktives Projekt aus.",
  "gmail.inbox.dismissSelected": "Ausgewählte verwerfen",
  "gmail.inbox.empty":
    "Keine wartenden Nachrichten. Führen Sie „Jetzt synchronisieren“ aus, um E-Mails aus Gmail abzurufen.",
  "gmail.inbox.indexSelected": "Index ausgewählt ({{count}})",
  "gmail.inbox.loadMore": "Mehr laden ({{visible}} / {{total}})",
  "gmail.inbox.selectAllPages": "Wählen Sie alle Seiten aus",
  "gmail.inbox.selectVisible": "Wählen Sie sichtbar aus",
  "gmail.inbox.showing":
    "Im Posteingang werden {{visible}} von {{total}} angezeigt",
  "gmail.inbox.subtitle":
    "Sync ruft hier neue Gmail-Nachrichten ab. Wählen Sie „Ausgewählte indexieren“, um sie für die Chat-Suche einzubetten, oder „Verwerfen“, um sie zu überspringen.",
  "gmail.inbox.title": "Posteingang (Überprüfung vor der Indizierung)",
  "gmail.indexed.deleteEmailA11y": "E-Mail löschen",
  "gmail.indexed.editEmailA11y": "E-Mail bearbeiten",
  "gmail.indexed.empty":
    "Es wurden noch keine Gmail-Nachrichten indiziert. Sync zieht E-Mails in den Posteingang; Wählen Sie „Index ausgewählt“, um hier E-Mails hinzuzufügen.",
  "gmail.indexed.subtitle": "Gmail-Nachrichten für die Chat-Suche indiziert.",
  "gmail.indexed.title": "Indizierte E-Mails",
  "gmail.indexed.viewEmailA11y": "E-Mail anzeigen",
  "gmail.jobs.duration": "· {{seconds}}s",
  "gmail.jobs.empty": "Noch keine Synchronisierungsaufträge.",
  "gmail.jobs.fetchedIndexed":
    "{{fetched}} in Posteingang abgerufen · {{indexed}} im Job indiziert",
  "gmail.jobs.subtitle": "Letzte Gmail-Synchronisierungsaktivität",
  "gmail.jobs.title": "Jobs synchronisieren",
  "gmail.refresh": "Aktualisieren",
  "gmail.stats.autoSyncEvery": "Alle automatisch synchronisieren",
  "gmail.stats.awaitingReview": "Warten auf Rezension",
  "gmail.stats.indexedForChat": "Für den Chat indiziert",
  "gmail.stats.lastSynced": "Zuletzt synchronisiert",
  "gmail.status.subtitle": "Verbundener Integrationsstatus",
  "gmail.sync.inProgress":
    "Synchronisierung läuft – E-Mails werden in Ihren Posteingang abgerufen …",
  "gmail.title": "Gmail-Integration",
  "gmail.toast.authOpened": "Gmail-Autorisierung geöffnet",
  "gmail.toast.autoSyncPaused":
    "Die automatische Synchronisierung von Gmail wurde angehalten",
  "gmail.toast.autoSyncResumed":
    "Die automatische Gmail-Synchronisierung wurde fortgesetzt",
  "gmail.toast.connected":
    "Gmail verbunden. Ihr Gmail-Konto wurde erfolgreich verknüpft.",
  "gmail.toast.credentialsSaved": "Anmeldedaten gespeichert",
  "gmail.toast.disconnected": "Gmail wurde getrennt",
  "gmail.toast.dismissed":
    "Ausgewählte Nachrichten aus dem Posteingang entfernt",
  "gmail.toast.dismissFailed": "Nachrichten konnten nicht entfernt werden.",
  "gmail.toast.indexed": "Indizierte {{count}}-Nachricht(en).",
  "gmail.toast.indexedWithErrors":
    "Indiziert {{indexed}}. {{errors}} Nachricht(en) konnten nicht indiziert werden.",
  "gmail.toast.indexFailed":
    "Ausgewählte Nachrichten konnten nicht indiziert werden.",
  "gmail.toast.redirectCopied":
    "Umleitungs-URI für Google Cloud Console kopiert.",
  "gmail.toast.redirectCopyFailed":
    "Der Umleitungs-URI konnte nicht kopiert werden. Bitte versuchen Sie es erneut.",
  "gmail.toast.redirectReset": "Umleitungs-URI zurückgesetzt",
  "gmail.toast.syncStarted": "Die Gmail-Synchronisierung wurde gestartet",
  "googleDrive.refresh": "Aktualisieren",
  "help.description":
    "Schnellstart mit Anleitungen, Tutorials und umfassender Dokumentation.",
  "help.explore.expoDocs": "Expo-Dokumentation",
  "help.explore.intro":
    "Diese Starter-App enthält ein Beispiel \nCode, der Ihnen den Einstieg erleichtert.",
  "help.explore.learnMore": "Erfahren Sie mehr",
  "help.explore.sections.animations.bodyMiddle":
    "Komponente nutzt das Mächtige",
  "help.explore.sections.animations.bodyPrefix":
    "Diese Vorlage enthält ein Beispiel einer animierten Komponente. Der",
  "help.explore.sections.animations.bodySuffix":
    "Bibliothek, um das Öffnen dieses Hinweises zu animieren.",
  "help.explore.sections.animations.title": "Animationen",
  "help.explore.sections.fileRouting.body1Middle": "Und",
  "help.explore.sections.fileRouting.body1Prefix":
    "Diese App verfügt über zwei Bildschirme:",
  "help.explore.sections.fileRouting.body2Prefix": "Die Layoutdatei in",
  "help.explore.sections.fileRouting.body2Suffix":
    "Richtet den Tab-Navigator ein.",
  "help.explore.sections.fileRouting.title": "Dateibasiertes Routing",
  "help.explore.sections.images.bodyMiddle": "Und",
  "help.explore.sections.images.bodyPrefix":
    "Für statische Bilder können Sie die verwenden",
  "help.explore.sections.images.bodySuffix":
    "Suffixe, um Dateien für unterschiedliche Bildschirmdichten bereitzustellen.",
  "help.explore.sections.images.title": "Bilder",
  "help.explore.sections.platformSupport.bodyPrefix":
    "Sie können dieses Projekt auf Android, iOS und im Internet öffnen. Um die Webversion zu öffnen, drücken Sie",
  "help.explore.sections.platformSupport.bodySuffix":
    "im Terminal, auf dem dieses Projekt ausgeführt wird.",
  "help.explore.sections.platformSupport.title":
    "Android-, iOS- und Web-Unterstützung",
  "help.explore.sections.themes.bodyPrefix":
    "Diese Vorlage unterstützt den Hell- und Dunkelmodus. Der",
  "help.explore.sections.themes.bodySuffix":
    "Mit dem Hook können Sie das aktuelle Farbschema des Benutzers überprüfen und die Farben der Benutzeroberfläche entsprechend anpassen.",
  "help.explore.sections.themes.title": "Komponenten im Hell- und Dunkelmodus",
  "help.explore.title": "Erkunden",
  "help.gettingStarted.title": "Erste Schritte",
  "help.guide.button.continue": "Fortsetzen",
  "help.guide.button.docs": "Dokumentation",
  "help.guide.button.markComplete": "Als abgeschlossen markieren",
  "help.guide.button.readDocs": "Dokumentation lesen",
  "help.guide.button.start": "Starten",
  "help.guide.button.watchVideo": "Video ansehen",
  "help.guide.difficulty.advanced": "Experte",
  "help.guide.difficulty.beginner": "Anfänger",
  "help.guide.difficulty.intermediate": "Fortgeschritten",
  "help.guide.steps": "{{completed}}/{{total}} Schritte",
  "help.guide.stepsCompleted": "{{completed}}/{{total}} abgeschlossen",
  "help.guides.configureChatbot.description":
    "Passen Sie das Aussehen, Verhalten und die KI-Einstellungen Ihres Chatbot-Widgets an.",
  "help.guides.configureChatbot.step1.description":
    "Gehen Sie zur Chatbot Configuration in der Seitenleiste.",
  "help.guides.configureChatbot.step1.title":
    "Zur Chatbot-Konfiguration navigieren",
  "help.guides.configureChatbot.step2.description":
    "Passen Sie Farben, Schriftarten, Position und Einstellungen der Auslöseschaltfläche an.",
  "help.guides.configureChatbot.step2.title": "Aussehen konfigurieren",
  "help.guides.configureChatbot.step3.description":
    "Wählen Sie Ihren KI-Anbieter und konfigurieren Sie die Modell-Einstellungen.",
  "help.guides.configureChatbot.step3.title": "KI-Modell einrichten",
  "help.guides.configureChatbot.step4.description":
    "Verwenden Sie die Vorschau, um Ihre Chatbot-Konfiguration zu testen.",
  "help.guides.configureChatbot.step4.title": "Ihren Chatbot testen",
  "help.guides.configureChatbot.step5.description":
    "Kopieren Sie den Integrationscode und fügen Sie ihn zu Ihrer Website hinzu.",
  "help.guides.configureChatbot.step5.title": "Einbettungscode erhalten",
  "help.guides.configureChatbot.title": "Ihren Chatbot konfigurieren",
  "help.guides.configureSearch.description":
    "Richten Sie Ihr Such-Widget mit KI-gestützten Suchfunktionen ein und passen Sie es an.",
  "help.guides.configureSearch.step1.description":
    "Gehen Sie zur Search Configuration in der Seitenleiste.",
  "help.guides.configureSearch.step1.title": "Zur Suchkonfiguration navigieren",
  "help.guides.configureSearch.step2.description":
    "Richten Sie Suchtitel, Platzhalter, Vorschläge und Aussehen ein.",
  "help.guides.configureSearch.step2.title": "Sucheinstellungen konfigurieren",
  "help.guides.configureSearch.step3.description":
    "Wählen Sie Ihren KI-Anbieter und konfigurieren Sie die Modell-Einstellungen für die Suche.",
  "help.guides.configureSearch.step3.title": "KI-Modell einrichten",
  "help.guides.configureSearch.step4.description":
    "Verwenden Sie die Registerkarte Search Test, um Ihre Suchkonfiguration zu testen.",
  "help.guides.configureSearch.step4.title": "Ihre Suche testen",
  "help.guides.configureSearch.step5.description":
    "Kopieren Sie den Integrationscode und fügen Sie ihn zu Ihrer Website hinzu.",
  "help.guides.configureSearch.step5.title": "Einbettungscode erhalten",
  "help.guides.configureSearch.title": "Ihre Suche konfigurieren",
  "help.guides.setupFirstCrawlSource.description":
    "Erfahren Sie, wie Sie Ihre erste Website zum Crawlen und Indizieren hinzufügen und konfigurieren.",
  "help.guides.setupFirstCrawlSource.step1.description":
    "Gehen Sie zum Crawl-Bereich in der Seitenleiste und klicken Sie auf die Registerkarte Sources.",
  "help.guides.setupFirstCrawlSource.step1.title":
    "Zu Crawl-Quellen navigieren",
  "help.guides.setupFirstCrawlSource.step2.description":
    "Klicken Sie auf die Schaltfläche 'Add Source' und geben Sie Ihre Website-URL ein.",
  "help.guides.setupFirstCrawlSource.step2.title": "Neue Quelle hinzufügen",
  "help.guides.setupFirstCrawlSource.step3.description":
    "Legen Sie Crawl-Tiefe, Häufigkeit und URL-Muster fest.",
  "help.guides.setupFirstCrawlSource.step3.title":
    "Einstellungen konfigurieren",
  "help.guides.setupFirstCrawlSource.step4.description":
    "Speichern Sie Ihre Quelle und lösen Sie den ersten Crawl-Job aus.",
  "help.guides.setupFirstCrawlSource.step4.title": "Ersten Crawl starten",
  "help.guides.setupFirstCrawlSource.title":
    "Ihre erste Crawl-Quelle einrichten",
  "help.guides.setupFirstDocumentSource.description":
    "Erfahren Sie, wie Sie Dokumente in Ihrer Wissensdatenbank hochladen und verwalten.",
  "help.guides.setupFirstDocumentSource.step1.description":
    "Gehen Sie zum Crawl-Bereich in der Seitenleiste und klicken Sie auf die Registerkarte Documents.",
  "help.guides.setupFirstDocumentSource.step1.title":
    "Zu Dokumenten navigieren",
  "help.guides.setupFirstDocumentSource.step2.description":
    "Klicken Sie auf die Schaltfläche 'Upload Document' und wählen Sie Ihre Datei aus.",
  "help.guides.setupFirstDocumentSource.step2.title": "Dokument hochladen",
  "help.guides.setupFirstDocumentSource.step3.description":
    "Fügen Sie Titel, Beschreibung und Tags zu Ihrem Dokument hinzu.",
  "help.guides.setupFirstDocumentSource.step3.title": "Metadaten konfigurieren",
  "help.guides.setupFirstDocumentSource.step4.description":
    "Warten Sie, bis das Dokument verarbeitet und indiziert wurde.",
  "help.guides.setupFirstDocumentSource.step4.title": "Dokument verarbeiten",
  "help.guides.setupFirstDocumentSource.title":
    "Ihre erste Dokumentenquelle einrichten",
  "help.quickLinks.title": "Schnelllinks",
  "help.settings.contactSupport": "Kontaktieren Sie den Support",
  "help.settings.noResults":
    "Keine passenden Hilfethemen. Versuchen Sie, nach Thema, Aufbewahrung oder Gebietsschema zu suchen.",
  "help.settings.recommendedTopics": "Empfohlene Themen",
  "help.settings.searchLabel": "Hilfethemen durchsuchen",
  "help.settings.searchPlaceholder":
    "Durchsuchen Sie Dokumente, FAQ und Fehlerbehebung ...",
  "help.settings.subtitle":
    "Greifen Sie auf Produktdokumente und Supportkanäle zu.",
  "help.settings.topics.locale.description":
    "Gebietsschemaeinstellungen wirken sich auf die Formatierung und übersetzte Schnittstellenzeichenfolgen aus.",
  "help.settings.topics.locale.title":
    "Standardeinstellungen für Sprache und Region",
  "help.settings.topics.retention.description":
    "Die Aufbewahrung steuert die automatischen Bereinigungsfenster für gespeicherte Daten.",
  "help.settings.topics.retention.title":
    "Verhalten der Aufbewahrungsrichtlinie",
  "help.settings.topics.theme.description":
    "Die Darstellungseinstellungen gelten je nach Gerät und Arbeitsbereichssitzung.",
  "help.settings.topics.theme.title":
    "Synchronisierung der Theme-Einstellungen",
  "help.settings.viewDocs": "Dokumentation anzeigen",
  "help.title": "Hilfe & Dokumentation",
  "history.confidence.high": "Hohes Selbstvertrauen",
  "history.confidence.low": "Geringes Vertrauen",
  "history.confidence.medium": "Mittleres Selbstvertrauen",
  "history.confidence.short.high": "Hoch",
  "history.confidence.short.low": "Niedrig",
  "history.confidence.short.medium": "Mittel",
  "history.confidence.unknown": "Unbekannt",
  "history.detail.a11y.collapseSource": "Quellvorschau einklappen",
  "history.detail.a11y.collapseTimings": "Zeitpunkte für den Zusammenbruch",
  "history.detail.a11y.copySource": "Vorschau der Kopierquelle",
  "history.detail.a11y.expandSource": "Quellvorschau erweitern",
  "history.detail.a11y.expandTimings": "Erweitern Sie die Zeiten",
  "history.detail.collapse": "Zusammenbruch",
  "history.detail.copy": "Kopie",
  "history.detail.expand": "Expandieren",
  "history.detail.export": ".md exportieren",
  "history.detail.language": "Sprache",
  "history.detail.legacy":
    "Diese Nachricht wurde gespeichert, bevor detaillierte Analysen aktiviert wurden. Einige Abschnitte sind möglicherweise leer.",
  "history.detail.na": "Nicht verfügbar",
  "history.detail.open": "Offen",
  "history.detail.section.answer": "Antwort des Assistenten",
  "history.detail.section.query": "Benutzerabfrage",
  "history.detail.section.retrievalMeta": "Metadaten abrufen",
  "history.detail.section.runtime": "Verwendete Parameter",
  "history.detail.section.sources": "Quellen",
  "history.detail.section.timings": "Timings (ms)",
  "history.detail.section.tokens": "Token-Nutzung",
  "history.detail.sourceCopied": "Quelle kopiert.",
  "history.detail.sourceCopyFailed": "Quelle konnte nicht kopiert werden.",
  "history.detail.sourceNoPreview": "Keine Vorschau verfügbar.",
  "history.detail.sourceRelevance": "Relevanz",
  "history.detail.sourceRelevancePct": "Relevanz {{pct}}%",
  "history.detail.sourcesRelevanceHint":
    "Relevanz-% ist relativ innerhalb dieser Antwort (Rangfolge der Quellen), nicht die Gesamtkonfidenz des Modells.",
  "history.detail.subtitle":
    "Mit dieser Antwort wurde ein Laufzeit-Snapshot erfasst.",
  "history.detail.timing.llm": "LLM-Generierung",
  "history.detail.timing.reranking": "Neubewertung",
  "history.detail.timing.retrieval": "Abruf",
  "history.detail.timing.root": "Abfrageausführung",
  "history.detail.timing.spansTitle": "{{count}} Abschnitte",
  "history.detail.timing.total": "Gesamt",
  "history.detail.title": "Abfragedetails",
  "history.empty": "Keine Chatnachrichten gefunden.",
  "history.error.detailDescription":
    "Diese Nachricht wurde möglicherweise entfernt oder Sie haben keinen Zugriff.",
  "history.error.detailTitle": "Nachricht konnte nicht geladen werden",
  "history.error.loadDescription": "Bitte versuchen Sie es gleich noch einmal.",
  "history.error.loadTitle": "Der Verlauf konnte nicht geladen werden",
  "history.export.a11y.dismiss": "Exportmenü schließen",
  "history.export.a11y.format": "{{format}} exportieren",
  "history.export.menu": "Exportieren",
  "history.exportDetailedCsv": "Detaillierte CSV",
  "history.exportDetailedJson": "Detailliertes JSON",
  "history.exportListCsv": "CSV exportieren",
  "history.list.openDetails": "Abfragedetails öffnen",
  "history.listDescription": "Newest first. Open a row for full analytics.",
  "history.listTitle": "Abfragen",
  "history.loading": "Laden…",
  "history.loadMore": "Mehr laden",
  "history.responseMs": "{{ms}} ms total",
  "history.searchPlaceholder": "Suchen Sie nach Fragen oder Antworten…",
  "history.session": "Sitzung",
  "history.status.error": "Fehler",
  "history.status.greeting_default": "Begrüßung",
  "history.status.out_of_context": "Außerhalb des Kontexts",
  "history.status.privacy_block": "Datenschutzblock",
  "history.subtitle":
    "Überprüfen Sie frühere Chatbot-Fragen, Zeitpläne und Abrufdetails für Ihr aktives Projekt.",
  "history.tag.failed": "Fehlgeschlagen",
  "history.title": "Chatverlauf",
  "history.toast.copied": "In die Zwischenablage kopiert",
  "history.toast.copyFailed": "Der Kopiervorgang ist fehlgeschlagen",
  "history.toast.exportListDone": "Export heruntergeladen",
  "history.toast.exportListFailed": "Export fehlgeschlagen",
  "integrations.credentials.a11y.copyField": "{{field}} kopieren",
  "integrations.credentials.a11y.fieldCopied": "{{field}} kopiert",
  "integrations.credentials.apiEndpoint": "API-Endpunkt",
  "integrations.credentials.copied": "In die Zwischenablage kopiert",
  "integrations.web.csp.title": "Content Security Policy (CSP)",
  "integrations.web.csp.intro":
    "Wenn Ihre Website bereits einen Content-Security-Policy-Header sendet, fügen Sie diese Direktiven hinzu, damit das Widget-iframe geladen werden kann. Deutsche/DACH-Hosts benötigen typischerweise frame-src. Wenn Ihre Website keine CSP sendet, können Sie diesen Block überspringen.",
  "integrations.web.csp.copyLabel": "CSP-Allowlist kopieren",
  "integrations.web.csp.copied": "CSP-Allowlist kopiert",
  "integrations.web.proxy.title": "Reverse-Proxy mit gleicher Origin",
  "integrations.web.proxy.body":
    "Wenn Cookies, CSP oder Mixed-Content-Regeln die Einbettung blockieren, stellen Sie das Widget über einen Reverse-Proxy auf Ihrer Domain bereit, statt Assets direkt vom RAGSuite-Host zu laden.",
  "integrations.credentials.embedToken": "Einbettungs-Token",
  "integrations.credentials.embedTokenUnavailable":
    "Erlaubte Domains laden, um das Einbettungs-Token für das aktive Projekt abzurufen",
  "integrations.credentials.manageApiKeys":
    "Konfiguration → API-Schlüssel öffnen",
  "integrations.credentials.manageDomains": "Erlaubte Domains verwalten",
  "integrations.credentials.mobile.description":
    "Verwenden Sie einen mobilen API-Schlüssel (rgs_live_…) aus Konfiguration → API-Schlüssel. Verwenden Sie das Web-Einbettungs-Token nicht in nativen Apps.",
  "integrations.credentials.mobile.noEmbedToken":
    "Verwenden Sie das Web-Einbettungs-Token nicht in mobilen Apps — erstellen Sie stattdessen einen API-Schlüssel.",
  "integrations.credentials.mobile.title": "Mobile SDK-Anmeldedaten",
  "integrations.credentials.mobileApiKey": "Mobiler API-Schlüssel",
  "integrations.credentials.projectId": "Projekt-ID",
  "integrations.credentials.projectIdPlaceholder":
    "Wählen Sie ein Projekt, um Ihre Projekt-ID zu laden",
  "integrations.credentials.web.description":
    "Verwenden Sie diese Werte für HTML-Widget-Einbettungen. Das Einbettungs-Token ist nur für Web — niemals in mobilen Apps verwenden.",
  "integrations.credentials.web.title": "Web-Einbettungs-Anmeldedaten",
  "integrations.description":
    "Verwalten Sie Ihre KI-Chat- und Suchintegrationen in allen Umgebungen",
  "integrations.section.title": "Integrationen",
  "integrations.section.subtitle":
    "Kopieren Sie eingebettete Snippets für Web- und mobile Clients.",
  "integrations.tabs.reactNative": "Mobile",
  "inviteSetup.field.confirmPassword": "Neues Passwort bestätigen",
  "inviteSetup.field.username": "Benutzername",
  "login.2fa.description":
    "Geben Sie den Code von Ihrer Authenticator-App ein oder überprüfen Sie Ihre E-Mail auf den Bestätigungscode. Authenticator-Codes werden alle 30 Sekunden aktualisiert.",
  "login.2fa.helper":
    "Geben Sie den 6-stelligen Code von Ihrer Authenticator-App oder E-Mail ein",
  "login.2fa.resend": "Code erneut senden",
  "login.2fa.resending": "Wird gesendet...",
  "login.2fa.resendSuccess": "Ein neuer Code wurde an Ihre E-Mail gesendet.",
  "login.2fa.title": "Zwei-Faktor-Authentifizierungscode",
  "login.2fa.verify": "Überprüfen",
  "login.2fa.verifying": "Überprüfung läuft...",
  "login.brand.tagline": "Unternehmens-KI-Plattform",
  "login.errors.generic":
    "Etwas ist schief gelaufen. Bitte versuchen Sie es erneut.",
  "login.errors.invalid2FACode":
    "Bitte geben Sie einen gültigen 6-stelligen Code ein",
  "login.errors.invalidCredentials": "Ungültiger Benutzername oder Passwort.",
  "login.errors.missingCredentials":
    "Bitte geben Sie Benutzername und Passwort ein",
  "login.errors.sessionExpired":
    "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  "login.sessionExpired.title": "Sitzung abgelaufen",
  "login.sessionExpired.description": "Bitte melden Sie sich erneut an, um fortzufahren.",
  "login.features.analytics.description":
    "Verfolgen Sie Nutzung, Leistung und Benutzerzufriedenheit",
  "login.features.analytics.title": "Erweiterte Analytik",
  "login.features.deployment.description":
    "Veröffentlichen Sie Search und Assistant über einbettbare Widgets",
  "login.features.deployment.title": "Schnelle Bereitstellung",
  "login.features.description":
    "Läuft auf Ihrer Infrastruktur. Verwalten Sie Inhalte, Connectors und Analysen über ein Dashboard.",
  "login.features.security.description":
    "Self-hosted. Kein Phone-Home.",
  "login.features.security.title": "Unternehmenssicherheit",
  "login.features.title": "AI Search, AI Assistant und AI Connectors",
  "login.footer.copyright": "© 2026 RAGSuite. Unternehmens-KI-Plattform.",
  "login.form.password.label": "Passwort",
  "login.form.password.placeholder": "Geben Sie Ihr Passwort ein",
  "login.form.rememberMe": "Erinnere dich an mich",
  "login.form.submit.label": "Anmelden",
  "login.form.submit.loading": "Anmeldung läuft...",
  "login.form.username.label": "Benutzername",
  "login.form.username.placeholder": "Geben Sie Ihren Benutzernamen ein",
  "login.signup.link": "Registrieren",
  "login.signup.mobileLink": "Benutzerkonto erstellen",
  "login.signup.prompt": "Haben Sie noch kein Konto?",
  "login.sso.backLink": "Zurück zur Anmeldung",
  "login.welcome.mobileSubtitle": "Melden Sie sich an, um fortzufahren",
  "login.welcome.mobileTitle": "Willkommen bei {{orgName}}",
  "login.welcome.subtitle":
    "Melden Sie sich an, um auf Ihr Admin-Dashboard zuzugreifen",
  "login.welcome.title": "Willkommen zurück",
  "models.apiKey.replaceHelper":
    "Nur eingeben, wenn Sie den gespeicherten Schlüssel ersetzen möchten.",
  "models.apiKey.savedHint": "API-Schlüssel gespeichert",
  "models.apiKey.test.a11y": "Testen Sie die API-Schlüsselverbindung",
  "models.apiKey.test.button": "Verbindung testen",
  "models.apiKey.test.connectionFailed": "Verbindung fehlgeschlagen.",
  "models.apiKey.test.connectionSuccess": "Verbindung erfolgreich.",
  "models.apiKey.test.embedFailed":
    "Chat funktioniert, Embedding fehlgeschlagen.",
  "models.apiKey.test.invalidKey":
    "Ungültiger API-Schlüssel. Prüfen Sie, ob der Schlüssel zum gewählten Anbieter passt.",
  "models.apiKey.test.noKey": "Bitte zuerst einen API-Schlüssel eingeben.",
  "models.apiKey.test.noModel": "Bitte zuerst ein Chat-Modell auswählen.",
  "models.apiKey.test.ollama": "Ollama läuft lokal — kein API-Schlüssel nötig.",
  "models.apiKey.test.ollamaNoTest":
    "Ollama wird lokal ausgeführt – ein Verbindungstest ist nicht erforderlich.",
  "models.apiKey.test.success":
    "API-Schlüssel bestätigt — Verbindung funktioniert.",
  "models.apiKey.test.testing": "Wird getestet…",
  "moduleSaveBar.saveChanges": "Änderungen speichern",
  "n8n.title": "n8n-Integration",
  "nav.analytics": "Analytik",
  "nav.chatbot-configuration": "Chatbot-Konfiguration",
  "nav.compare-models": "Modelle Vergleichen",
  "nav.configuration": "Konfiguration",
  "nav.crawl": "Crawling",
  "nav.dashboard": "Armaturenbrett",
  "nav.documents": "Dokumente",
  "nav.feedback": "Rückmeldung",
  "nav.group.application": "Anwendung",
  "nav.group.management": "Verwaltung",
  "nav.history": "Verlauf",
  "nav.integrations": "Integrationen",
  "nav.overview": "Übersicht",
  "nav.rag-tuning": "RAG-Anpassung",
  "nav.search-configuration": "Suchkonfiguration",
  "nav.settings": "Einstellungen",
  "nav.tab.search": "Suche",
  "notifications.actions.deleteAll": "Alle löschen",
  "notifications.actions.deleting": "Löschen...",
  "notifications.actions.markAllAsRead": "Alle als gelesen markieren",
  "notifications.actions.marking": "Markiere...",
  "notifications.actions.view": "Ansehen",
  "notifications.description":
    "Systemwarnungen, Updates und wichtige Benachrichtigungen",
  "notifications.detail.message": "Nachricht",
  "notifications.detail.notAvailable": "N/V",
  "notifications.empty": "Keine Benachrichtigungen gefunden",
  "notifications.error.loadFailed": "Fehler beim Laden der Benachrichtigungen",
  "notifications.error.retry": "Wiederholen",
  "notifications.filters.status.all": "Alle",
  "notifications.filters.status.read": "Gelesen",
  "notifications.filters.status.unread": "Ungelesen",
  "notifications.filters.type.all": "Alle Typen",
  "notifications.filters.type.error": "Fehler",
  "notifications.filters.type.info": "Information",
  "notifications.filters.type.placeholder": "Typ",
  "notifications.filters.type.success": "Erfolg",
  "notifications.filters.type.warning": "Warnung",
  "notifications.loading": "Benachrichtigungen werden geladen...",
  "notifications.title": "Benachrichtigungen",
  "notifications.toast.error.deleteAllFailed":
    "Fehler beim Löschen aller Benachrichtigungen",
  "notifications.toast.error.deleteFailed":
    "Fehler beim Löschen der Benachrichtigung",
  "notifications.toast.error.markAllReadFailed":
    "Fehler beim Markieren aller Benachrichtigungen als gelesen",
  "notifications.toast.error.markReadFailed":
    "Fehler beim Markieren der Benachrichtigung als gelesen",
  "notifications.toast.error.title": "Fehler",
  "notifications.toast.success.deleted": "Benachrichtigung gelöscht",
  "notifications.toast.success.deletedAll": "Alle Benachrichtigungen gelöscht",
  "notifications.toast.success.markAllRead":
    "Alle Benachrichtigungen als gelesen markiert",
  "notifications.toast.success.title": "Erfolg",
  "notion.refresh": "Aktualisieren",
  "notion.sources.search": "Suchen",
  "onboarding.actions.completing": "Wird abgeschlossen...",
  "onboarding.actions.finish": "Einrichtung abschließen",
  "onboarding.actions.processing": "Wird verarbeitet...",
  "onboarding.branding.logo.change": "Logo ändern",
  "onboarding.branding.logo.label": "Logo hochladen (optional)",
  "onboarding.branding.logo.remove": "Logo entfernen",
  "onboarding.branding.logo.upload": "Logo hochladen",
  "onboarding.branding.orgName.label": "Name der Organisation",
  "onboarding.branding.orgName.placeholder":
    "Geben Sie den Namen Ihrer Organisation ein",
  "onboarding.branding.primaryColor.label": "Primärfarbe",
  "onboarding.branding.themePresets.label": "Designvorlagen",
  "onboarding.crawl.inProgress.description":
    "Bitte warten Sie, bis der Crawl abgeschlossen ist, bevor Sie fortfahren.",
  "onboarding.crawl.inProgress.title": "Crawl läuft",
  "onboarding.dataSource.actions.crawling": "Crawl läuft...",
  "onboarding.dataSource.actions.creating": "Wird erstellt...",
  "onboarding.dataSource.actions.skip": "Vorerst überspringen",
  "onboarding.dataSource.actions.startCrawl": "Crawl starten",
  "onboarding.dataSource.cadence.daily": "Täglich (empfohlen)",
  "onboarding.dataSource.cadence.label": "Crawl-Frequenz",
  "onboarding.dataSource.cadence.once": "Einmalig",
  "onboarding.dataSource.cadence.weekly": "Wöchentlich",
  "onboarding.dataSource.depth.label": "Crawl-Tiefe",
  "onboarding.dataSource.depth.option0": "Nur diese Seite",
  "onboarding.dataSource.depth.option1":
    "1 Ebene (Start-URL + verlinkte Seiten)",
  "onboarding.dataSource.depth.option2": "2 Ebenen (empfohlen)",
  "onboarding.dataSource.depth.option3": "3 Ebenen",
  "onboarding.dataSource.depth.option4": "4 Ebenen",
  "onboarding.dataSource.depth.option5": "5 Ebenen (tiefes Crawling)",
  "onboarding.dataSource.headless.helper":
    "Aktivieren für JavaScript-lastige Websites",
  "onboarding.dataSource.headless.label": "Headless-Browser-Modus",
  "onboarding.dataSource.invalid.addNew": "Neue Website hinzufügen",
  "onboarding.dataSource.invalid.description":
    "Die eingegebene URL ist ungültig. Bitte geben Sie eine gültige Website-URL ein und versuchen Sie es erneut.",
  "onboarding.dataSource.invalid.title": "Ungültige URL",
  "onboarding.dataSource.progress.description":
    "Bitte warten Sie, während wir Ihre Website crawlen. Sie können zum nächsten Schritt wechseln, sobald der Crawl abgeschlossen ist.",
  "onboarding.dataSource.progress.title": "Crawl läuft...",
  "onboarding.dataSource.success.description":
    'Sie können jetzt mit dem Button "Weiter" zum nächsten Schritt wechseln.',
  "onboarding.dataSource.success.title": "Crawl erfolgreich abgeschlossen.",
  "onboarding.dataSource.url.helper":
    "Geben Sie die URL Ihrer Dokumentation oder Inhaltsseite ein",
  "onboarding.dataSource.url.label": "Website-URL",
  "onboarding.errors.projectRequired":
    "Kein Projekt verfügbar. Gehen Sie zurück und erstellen Sie zuerst ein Projekt.",
  "onboarding.errors.startCrawlFailed":
    "Crawl konnte nicht gestartet werden. Bitte versuchen Sie es erneut.",
  "onboarding.errors.urlRequired":
    "Bitte geben Sie zuerst eine Website-URL ein",
  "onboarding.header.subtitle":
    "Richten Sie AI Search, AI Assistant und AI Connectors in wenigen Schritten ein",
  "onboarding.header.title": "Willkommen bei {{brand}}",
  "onboarding.loading.status": "Onboarding-Status wird geladen...",
  "onboarding.preview.branding.description":
    "So wird Ihr Branding in der Admin-Oberfläche und im eingebetteten Widget angezeigt.",
  "onboarding.preview.branding.orgNamePlaceholder": "Ihre Organisation",
  "onboarding.preview.crawl.depthLabel": "Tiefe:",
  "onboarding.preview.crawl.depthValue": "{{count}} Ebenen",
  "onboarding.preview.crawl.frequencyLabel": "Frequenz:",
  "onboarding.preview.crawl.headless.disabled": "Deaktiviert",
  "onboarding.preview.crawl.headless.enabled": "Aktiviert",
  "onboarding.preview.crawl.headlessLabel": "Kopflos:",
  "onboarding.preview.crawl.title": "Crawl-Konfiguration",
  "onboarding.preview.primaryButton": "Primärer Button",
  "onboarding.preview.project.activeBadge":
    "Dies wird Ihr aktives Projekt sein",
  "onboarding.preview.project.descriptionLabel": "Beschreibung:",
  "onboarding.preview.project.descriptionPlaceholder":
    "Projektbeschreibung wird hier angezeigt",
  "onboarding.preview.project.nameLabel": "Projektname:",
  "onboarding.preview.project.namePlaceholder": "Name Ihres Projekts",
  "onboarding.preview.project.title": "Projektvorschau",
  "onboarding.preview.status.aiModelReady": "KI-Modell bereit",
  "onboarding.preview.status.dataSourceAdded": "Datenquelle hinzugefügt",
  "onboarding.preview.status.orgConfigured": "Organisation konfiguriert",
  "onboarding.preview.status.projectCreated": "Projekt erstellt",
  "onboarding.preview.status.title": "Systemstatus",
  "onboarding.preview.status.vectorDbReady": "Vektordatenbank initialisiert",
  "onboarding.preview.title": "Live-Vorschau",
  "onboarding.project.description.counter": "{{count}} / {{max}} Zeichen",
  "onboarding.project.description.errorTooLong":
    "Die Projektbeschreibung darf höchstens {{max}} Zeichen lang sein. Aktuell: {{count}} Zeichen.",
  "onboarding.project.description.helper":
    "Geben Sie eine kurze Beschreibung Ihres Projekts",
  "onboarding.project.description.label": "Projektbeschreibung",
  "onboarding.project.description.limitExceeded": "(Limit überschritten)",
  "onboarding.project.description.placeholder":
    "Beschreiben Sie, wofür dieses Projekt gedacht ist...",
  "onboarding.project.name.helper":
    "Geben Sie Ihrem Projekt einen beschreibenden Namen",
  "onboarding.project.name.label": "Projektname",
  "onboarding.project.name.placeholder": "Mein erstes Projekt",
  "onboarding.step.label": "Schritt {{step}}: {{title}}",
  "onboarding.steps.branding.description": "Passen Sie Ihre Organisation an",
  "onboarding.steps.dataSource.description":
    "Fügen Sie Ihre erste Inhaltsquelle hinzu",
  "onboarding.steps.dataSource.title": "Datenquelle",
  "onboarding.steps.project.description": "Richten Sie Ihr erstes Projekt ein",
  "onboarding.steps.project.title": "Projekt erstellen",
  "onboarding.steps.test.description": "Testen Sie Ihr RAG-System",
  "onboarding.steps.test.title": "Schnelltest",
  "onboarding.test.errorResponse":
    "Entschuldigung, ich konnte Ihre Anfrage nicht verarbeiten. Bitte versuchen Sie es erneut.",
  "onboarding.test.examples.four": "Was sind die Systemanforderungen?",
  "onboarding.test.examples.one": "Wie fange ich an?",
  "onboarding.test.examples.three":
    "Wie konfiguriere ich die Authentifizierung?",
  "onboarding.test.examples.two": "Was sind die API-Endpunkte?",
  "onboarding.test.helper":
    "Stellen Sie eine Frage, um zu sehen, wie Ihr KI-Assistent mit Ihrer konfigurierten Datenquelle antwortet.",
  "onboarding.test.noResponse": "Keine Antwort erhalten",
  "onboarding.test.placeholder": "Fragen Sie zu Ihrer Dokumentation...",
  "onboarding.test.processing": "Ihre Anfrage wird verarbeitet...",
  "onboarding.test.responseLabel": "KI-Antwort:",
  "onboarding.test.title": "Testen Sie Ihr RAG-System",
  "org.members.col.actions": "Aktionen",
  "org.members.col.user": "Benutzer",
  "org.members.field.username": "Benutzername",
  "org.members.role.orgAdmin": "Administrator",
  "org.members.status.active": "Aktiv",
  "org.members.status.inactive": "Inaktiv",
  "org.members.title": "Teammitglieder",
  "org.permissions.chatbot.integrations": "Integrationen",
  "org.permissions.chatbot.settings": "Einstellungen",
  "org.permissions.crawl.documents": "Dokumente",
  "org.permissions.modules.analytics": "Analytik",
  "org.permissions.modules.crawl": "Crawling",
  "org.permissions.modules.history": "Verlauf",
  "org.permissions.modules.profile": "Mein Profil",
  "org.permissions.modules.search": "Suchen",
  "org.permissions.modules.settings": "Einstellungen",
  "org.permissions.profile.general": "Allgemein",
  "org.permissions.profile.security": "Sicherheit",
  "org.permissions.projectLabel": "Projekt",
  "org.permissions.search.integrations": "Integrationen",
  "org.permissions.search.settings": "Einstellungen",
  "org.permissions.settings.i18n": "Internationalisierung",
  "org.sso.subtitle":
    "Google-SSO (OIDC) für eingeladene Benutzer konfigurieren. JIT-Provisioning ist deaktiviert.",
  "org.sso.test": "Verbindung testen",
  "org.sso.testing": "Wird getestet…",
  "org.sso.title": "Google-Anmeldung",
  "org.tabs.overview": "Übersicht",
  "org.toast.copied": "In die Zwischenablage kopiert",
  "org.toast.error": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
  "overview.chart.noData": "Keine Daten verfügbar",
  "overview.chart.queriesOverTime.title": "Anfragen im Zeitverlauf",
  "overview.description":
    "Überwachen Sie die Leistung Ihres RAG-Systems und das Nutzerengagement",
  "overview.errors.loadFailed": "Fehler beim Laden der Übersichtsdaten",
  "overview.errors.loadingError": "Fehler beim Laden der Übersicht",
  "overview.feedback.down": "Gefällt mir nicht",
  "overview.feedback.notAvailable": "Keine Rückmeldungen verfügbar",
  "overview.feedback.title": "Neueste Rückmeldungen",
  "overview.feedback.up": "Gefällt mir",
  "overview.refresh.error.description":
    "Fehler beim Aktualisieren der Übersichtsdaten. Bitte versuchen Sie es erneut.",
  "overview.refresh.error.title": "Aktualisierung Fehlgeschlagen",
  "overview.refresh.success.description":
    "Übersichtsdaten wurden aktualisiert.",
  "overview.refresh.success.title": "Daten Aktualisiert",
  "overview.sources.docs": "{{count}}-Dokumente",
  "overview.sources.error": "1 Fehler",
  "overview.sources.errorBadge": "1 Fehler",
  "overview.sources.errorBadgePlural": "{{count}} Fehler",
  "overview.sources.errors": "{{count}} Fehler",
  "overview.sources.lastCrawl": "Letzter Crawl:",
  "overview.sources.neverCrawled": "Nie gecrawlt",
  "overview.sources.notFound": "Keine Crawl-Quellen gefunden",
  "overview.sources.title": "Top Crawl-Quellen",
  "overview.sources.zeroDocs": "0 Dokumente",
  "overview.stats.p95Latency.description": "durchschnittliche Antwortzeit",
  "overview.stats.p95Latency.title": "p95 Latenz",
  "overview.stats.queriesToday.fromToday": "seit heute",
  "overview.stats.queriesToday.fromYesterday": "seit gestern",
  "overview.stats.queriesToday.title": "Anfragen Heute",
  "overview.stats.thumbsUpRate.description": "Benutzerzufriedenheit",
  "overview.stats.thumbsUpRate.title": "Daumen-hoch Rate",
  "overview.stats.tokenUsage.description": "insgesamt verwendete Tokens",
  "overview.stats.tokenUsage.notReported": "Wird von der API nicht gemeldet",
  "overview.stats.tokenUsage.title": "Token-Nutzung",
  "overview.time.dayAgo": "vor 1 Tag",
  "overview.time.daysAgo": "vor {{count}} Tagen",
  "overview.time.hourAgo": "vor 1 Stunde",
  "overview.time.hoursAgo": "vor {{count}} Stunden",
  "overview.time.justNow": "Gerade eben",
  "overview.time.minuteAgo": "vor 1 Min",
  "overview.time.minutesAgo": "vor {{count}} Mins",
  "overview.time.unknown": "Unbekannt",
  "profile.actions.save": "Änderungen speichern",
  "profile.actions.saving": "Wird gespeichert...",
  "profile.actions.updatePassword": "Passwort aktualisieren",
  "profile.actions.updatingPassword": "Aktualisieren...",
  "profile.avatar.updateLabel": "Avatar aktualisieren",
  "profile.badge.admin": "Administrator",
  "profile.badge.user": "Benutzer",
  "profile.defaultUser": "Benutzer",
  "profile.departments.engineering": "Entwicklung",
  "profile.departments.operations": "Betrieb",
  "profile.departments.product": "Produkt",
  "profile.departments.sales": "Vertrieb",
  "profile.dialogs.backupCodes.copied": "Kopiert",
  "profile.dialogs.backupCodes.copy": "Kopie",
  "profile.dialogs.backupCodes.description":
    "Bewahren Sie diese Codes sicher auf. Sie können verwendet werden, um auf Ihr Konto zuzugreifen, wenn Sie Ihr Authenticator-Gerät verlieren.",
  "profile.dialogs.backupCodes.notice":
    "Diese Codes werden nur einmal angezeigt. Bitte an einem sicheren Ort aufbewahren.",
  "profile.dialogs.backupCodes.saved": "Ich habe diese Codes gespeichert",
  "profile.dialogs.backupCodes.title": "Backup-Codes",
  "profile.dialogs.disable2fa.codeHelper":
    "Oder verwenden Sie einen Backup-Code, wenn Sie keinen Zugriff auf Ihren Authenticator haben",
  "profile.dialogs.disable2fa.codeLabel": "2FA-Code",
  "profile.dialogs.disable2fa.description":
    "Geben Sie Ihr Passwort und den 2FA-Code ein, um die Zwei-Faktor-Authentifizierung zu deaktivieren",
  "profile.dialogs.disable2fa.disable": "2FA deaktivieren",
  "profile.dialogs.disable2fa.disabling": "Wird deaktiviert...",
  "profile.dialogs.disable2fa.passwordLabel": "Passwort",
  "profile.dialogs.disable2fa.passwordPlaceholder":
    "Geben Sie Ihr Passwort ein",
  "profile.dialogs.disable2fa.title":
    "Zwei-Faktor-Authentifizierung deaktivieren",
  "profile.dialogs.email2fa.disableDescription":
    "Geben Sie Ihr Passwort ein, um die E-Mail-basierte Zwei-Faktor-Authentifizierung zu deaktivieren.",
  "profile.dialogs.email2fa.disableTitle": "E-Mail-2FA deaktivieren",
  "profile.dialogs.email2fa.enableDescription":
    "Geben Sie Ihr Passwort ein, um die E-Mail-basierte Zwei-Faktor-Authentifizierung zu aktivieren. Sie erhalten beim Anmelden Bestätigungscodes per E-Mail.",
  "profile.dialogs.email2fa.enableTitle": "E-Mail-2FA aktivieren",
  "profile.dialogs.email2fa.passwordLabel": "Passwort",
  "profile.dialogs.email2fa.passwordPlaceholder": "Geben Sie Ihr Passwort ein",
  "profile.dialogs.setup2fa.description":
    "Scannen Sie den QR-Code mit Ihrer Authenticator-App",
  "profile.dialogs.setup2fa.title": "Zwei-Faktor-Authentifizierung einrichten",
  "profile.dialogs.setup2fa.verify": "Verifizieren",
  "profile.dialogs.verify2fa.codeLabel": "Verifizierungscode",
  "profile.dialogs.verify2fa.description":
    "Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein",
  "profile.dialogs.verify2fa.title":
    "Zwei-Faktor-Authentifizierung verifizieren",
  "profile.dialogs.verify2fa.verifyAndEnable": "Verifizieren & aktivieren",
  "profile.dialogs.verify2fa.verifying": "Wird verifiziert...",
  "profile.errors.loadFailed": "Profildaten sind derzeit nicht verfügbar.",
  "profile.errors.securityActionFailed":
    "Die Sicherheitsmaßnahme ist fehlgeschlagen.",
  "profile.fields.bioPlaceholder": "Erzählen Sie uns etwas über sich...",
  "profile.fields.confirmPassword": "Neues Passwort bestätigen",
  "profile.fields.confirmPasswordPlaceholder": "Neues Passwort bestätigen",
  "profile.fields.currentPassword": "Aktuelles Passwort",
  "profile.fields.currentPasswordPlaceholder": "Aktuelles Passwort eingeben",
  "profile.fields.department": "Abteilung",
  "profile.fields.departmentPlaceholder": "Abteilung auswählen",
  "profile.fields.email": "E-Mail-Adresse",
  "profile.fields.emailLocked": "E-Mail-Adresse kann nicht geändert werden",
  "profile.fields.emailLockedTitle": "E-Mail kann nicht geändert werden",
  "profile.fields.jobTitle": "Berufsbezeichnung",
  "profile.fields.jobTitlePlaceholder": "Geben Sie Ihre Berufsbezeichnung ein",
  "profile.fields.location": "Standort",
  "profile.fields.newPassword": "Neues Passwort",
  "profile.fields.newPasswordPlaceholder": "Neues Passwort eingeben",
  "profile.fields.phone": "Telefonnummer",
  "profile.fields.phonePlaceholder": "Geben Sie Ihre Telefonnummer ein",
  "profile.fields.timezone": "Zeitzone",
  "profile.fields.timezonePlaceholder": "Zeitzone auswählen",
  "profile.fields.username": "Benutzername",
  "profile.sections.contact.description":
    "Verwalten Sie Ihre Kontaktdaten und Zeitzone",
  "profile.sections.contact.title": "Kontakt & Standort",
  "profile.sections.personal.description":
    "Aktualisieren Sie Ihre persönlichen Daten und Kontaktinformationen",
  "profile.sections.personal.title": "Persönliche Informationen",
  "profile.sections.security.options.description":
    "Zusätzliche Sicherheitsoptionen für Ihr Konto",
  "profile.sections.security.options.title": "Sicherheitseinstellungen",
  "profile.sections.security.password.description":
    "Verwalten Sie Ihr Passwort und die Zwei-Faktor-Authentifizierung",
  "profile.sections.security.password.title": "Passwort & Authentifizierung",
  "profile.security.email2fa.disabled":
    "Erhalten Sie 2FA-Codes per E-Mail statt über eine Authenticator-App",
  "profile.security.email2fa.enabled":
    "E-Mail-2FA ist aktiviert. Sie erhalten beim Anmelden Codes per E-Mail.",
  "profile.security.email2fa.processing": "Wird verarbeitet...",
  "profile.security.email2fa.title":
    "E-Mail-basierte Zwei-Faktor-Authentifizierung",
  "profile.security.loginNotifications.description":
    "Benachrichtigung bei neuen Anmeldungen",
  "profile.security.loginNotifications.title": "Anmeldebenachrichtigungen",
  "profile.security.sessions.description": "Aktive Sitzungen verwalten",
  "profile.security.sessions.title": "Sitzungsverwaltung",
  "profile.security.sessions.view": "Sitzungen anzeigen",
  "profile.security.totp.backupCodes": "Backup-Codes",
  "profile.security.totp.disable": "Deaktivieren",
  "profile.security.totp.disabled":
    "Fügen Sie mit einer Authenticator-App eine zusätzliche Sicherheitsebene hinzu",
  "profile.security.totp.enable": "Aktivieren",
  "profile.security.totp.enabled": "TOTP-2FA ist für Ihr Konto aktiviert",
  "profile.security.totp.generating": "Wird generiert...",
  "profile.security.totp.settingUp": "Wird eingerichtet...",
  "profile.security.totp.title": "Zwei-Faktor-Authentifizierung (TOTP)",
  "profile.sessions.close": "Schließen",
  "profile.sessions.confirmRevokeAction": "Sitzung widerrufen",
  "profile.sessions.confirmRevokeAllAction": "Alle Sitzungen widerrufen",
  "profile.sessions.confirmRevokeAllCount":
    "{{count}} Sitzung(en) werden widerrufen",
  "profile.sessions.confirmRevokeAllDescription":
    "Sind Sie sicher, dass Sie alle anderen aktiven Sitzungen widerrufen möchten? Dadurch werden alle Benutzer von anderen Geräten sofort abgemeldet.",
  "profile.sessions.confirmRevokeAllTitle":
    "Alle anderen Sitzungen widerrufen?",
  "profile.sessions.confirmRevokeDescription":
    "Sind Sie sicher, dass Sie diese Sitzung widerrufen möchten? Der Benutzer wird sofort von diesem Gerät abgemeldet.",
  "profile.sessions.confirmRevokeTitle": "Sitzung widerrufen?",
  "profile.sessions.currentBadge": "Aktiv",
  "profile.sessions.currentDescription": "Dies ist Ihre aktuell aktive Sitzung",
  "profile.sessions.currentTitle": "Aktuelle Sitzung",
  "profile.sessions.description":
    "Verwalten Sie Ihre aktiven Anmeldesitzungen. Sie können jede Sitzung widerrufen, um die Abmeldung von diesem Gerät zu erzwingen.",
  "profile.sessions.lastActive": "Zuletzt aktiv",
  "profile.sessions.loadFailed": "Sitzungen konnten nicht geladen werden",
  "profile.sessions.loadFailedHint": "Bitte versuchen Sie es erneut",
  "profile.sessions.loading": "Sitzungen werden geladen...",
  "profile.sessions.loggedIn": "Eingeloggt",
  "profile.sessions.noneFound": "Keine aktiven Sitzungen gefunden",
  "profile.sessions.noOtherSessions": "Keine weiteren aktiven Sitzungen",
  "profile.sessions.onlyThisDevice": "Sie sind nur auf diesem Gerät angemeldet",
  "profile.sessions.otherDescription":
    "{{count}} aktive Sitzung(en) auf anderen Geräten",
  "profile.sessions.otherTitle": "Andere aktive Sitzungen",
  "profile.sessions.revoke": "Widerrufen",
  "profile.sessions.revokeAll": "Alles widerrufen",
  "profile.sessions.revoking": "Widerrufen...",
  "profile.sessions.title": "Aktive Sitzungen",
  "profile.subtitle": "Verwalten Sie Ihre Kontoeinstellungen und Präferenzen",
  "profile.summary.joined": "Beigetreten {{date}}",
  "profile.summary.unknownDate": "Unbekannt",
  "profile.tabs.general": "Allgemein",
  "profile.tabs.security": "Sicherheit",
  "profile.timezones.central": "Zentralzeit (CT)",
  "profile.timezones.cet": "Mitteleuropäische Zeit (CET)",
  "profile.timezones.eastern": "Ostküstenzeit (ET)",
  "profile.timezones.mountain": "Mountain-Zeit (MT)",
  "profile.timezones.pacific": "Pazifische Zeit (PT)",
  "profile.title": "Mein Profil",
  "profile.toast.2fa.disabled.description":
    "Zwei-Faktor-Authentifizierung wurde deaktiviert.",
  "profile.toast.2fa.disabled.title": "2FA deaktiviert",
  "profile.toast.2fa.disableFailed":
    "2FA konnte nicht deaktiviert werden. Bitte prüfen Sie Passwort und Code.",
  "profile.toast.2fa.enabled.description":
    "Zwei-Faktor-Authentifizierung wurde für Ihr Konto aktiviert.",
  "profile.toast.2fa.enabled.title": "2FA aktiviert",
  "profile.toast.2fa.setupFailed":
    "2FA konnte nicht eingerichtet werden. Bitte versuchen Sie es erneut.",
  "profile.toast.2fa.setupStarted.description":
    "Scannen Sie den QR-Code und geben Sie den Bestätigungscode ein.",
  "profile.toast.2fa.setupStarted.title": "2FA-Einrichtung gestartet",
  "profile.toast.2fa.verifyFailed.description":
    "Ungültiger Code. Bitte versuchen Sie es erneut.",
  "profile.toast.2fa.verifyFailed.title": "Verifizierung fehlgeschlagen",
  "profile.toast.avatarUpdated": "Avatar aktualisiert.",
  "profile.toast.backupCodes.description":
    "Neue Backup-Codes wurden erstellt. Bitte sicher aufbewahren.",
  "profile.toast.backupCodes.title": "Backup-Codes erstellt",
  "profile.toast.backupCodesFailed":
    "Backup-Codes konnten nicht neu erstellt werden.",
  "profile.toast.codeRequired.description":
    "Bitte geben Sie Ihren 2FA-Code ein.",
  "profile.toast.codeRequired.title": "Code erforderlich",
  "profile.toast.copied.description":
    "Backup-Code in die Zwischenablage kopiert.",
  "profile.toast.copied.title": "Kopiert",
  "profile.toast.email2fa.disabled.description":
    "E-Mail-basierte Zwei-Faktor-Authentifizierung wurde deaktiviert.",
  "profile.toast.email2fa.disabled.title": "E-Mail-2FA deaktiviert",
  "profile.toast.email2fa.disableFailed":
    "E-Mail-2FA konnte nicht deaktiviert werden. Bitte versuchen Sie es erneut.",
  "profile.toast.email2fa.enabled.description":
    "E-Mail-basierte Zwei-Faktor-Authentifizierung wurde aktiviert. Sie erhalten beim Anmelden Codes per E-Mail.",
  "profile.toast.email2fa.enabled.title": "E-Mail-2FA aktiviert",
  "profile.toast.email2fa.enableFailed":
    "E-Mail-2FA konnte nicht aktiviert werden. Bitte versuchen Sie es erneut.",
  "profile.toast.fileTooLarge.description":
    "Bitte wählen Sie ein Bild kleiner als 5 MB.",
  "profile.toast.fileTooLarge.title": "Datei zu groß",
  "profile.toast.invalidCode.description":
    "Bitte geben Sie einen 6-stelligen Code ein.",
  "profile.toast.invalidCode.title": "Ungültiger Code",
  "profile.toast.invalidFileType.description":
    "Bitte wählen Sie eine Bilddatei.",
  "profile.toast.invalidFileType.title": "Ungültiger Dateityp",
  "profile.toast.passwordMismatch":
    "Neues Passwort und Bestätigung stimmen nicht überein.",
  "profile.toast.passwordRequired.description":
    "Bitte geben Sie Ihr Passwort ein.",
  "profile.toast.passwordRequired.title": "Passwort erforderlich",
  "profile.toast.passwordTooShort":
    "Das Passwort muss mindestens 8 Zeichen lang sein.",
  "profile.toast.passwordUpdated.description":
    "Ihr Passwort wurde erfolgreich geändert.",
  "profile.toast.passwordUpdated.title": "Passwort aktualisiert",
  "profile.toast.passwordUpdateFailed":
    "Passwort konnte nicht aktualisiert werden. Bitte prüfen Sie Ihr aktuelles Passwort.",
  "profile.toast.readFileError.description":
    "Bilddatei konnte nicht gelesen werden.",
  "profile.toast.sessions.revoked": "Sitzung widerrufen.",
  "profile.toast.sessions.revokedOthers": "Andere Sitzungen widerrufen.",
  "profile.toast.updateFailed":
    "Profil konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut.",
  "profile.toast.updateSuccess.description":
    "Ihr Profil wurde erfolgreich aktualisiert.",
  "profile.toast.updateSuccess.title": "Profil aktualisiert",
  "projects.actions.clearFilters": "Filter zurücksetzen",
  "projects.actions.create": "Projekt erstellen",
  "projects.actions.creating": "Wird erstellt...",
  "projects.actions.deleting": "Wird gelöscht...",
  "projects.actions.update": "Projekt aktualisieren",
  "projects.actions.updating": "Wird aktualisiert...",
  "projects.date.unknown": "Unbekannt",
  "projects.dialog.create.description":
    "Erstellen Sie ein neues Projekt, um Ihre Dokumentation und Inhaltsquellen zu organisieren.",
  "projects.dialog.create.title": "Neues Projekt erstellen",
  "projects.dialog.delete.description":
    'Möchten Sie "{{name}}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
  "projects.dialog.delete.title": "Projekt löschen",
  "projects.dialog.edit.description":
    "Aktualisieren Sie die Projektdetails unten.",
  "projects.dialog.edit.title": "Projekt bearbeiten",
  "projects.dropdown.createNew": "Neues Projekt erstellen",
  "projects.dropdown.loadingSubtitle": "Bitte warten",
  "projects.dropdown.loadingTitle": "Wird geladen...",
  "projects.dropdown.noProjectDescription":
    "Erstellen Sie ein Projekt, um loszulegen",
  "projects.dropdown.noProjectTitle": "Kein Projekt",
  "projects.dropdown.switchLabel": "Projekt wechseln",
  "projects.dropdown.viewAll": "Alle Projekte anzeigen",
  "projects.empty.default": "Keine Projekte gefunden",
  "projects.empty.filtered":
    "Keine Projekte gefunden, die Ihren Filtern entsprechen",
  "projects.error.cannotDeleteActive.description":
    "Bitte wechseln Sie zu einem anderen Projekt, bevor Sie dieses löschen.",
  "projects.error.cannotDeleteActive.title":
    "Aktives Projekt kann nicht gelöscht werden",
  "projects.error.createFailed":
    "Projekt konnte nicht erstellt werden. Bitte erneut versuchen.",
  "projects.error.deleteFailed":
    "Projekt konnte nicht gelöscht werden. Bitte erneut versuchen.",
  "projects.error.descriptionRequired": "Projektbeschreibung ist erforderlich",
  "projects.error.descriptionTooLong":
    "Die Projektbeschreibung darf höchstens {{max}} Zeichen lang sein. Aktuell: {{count}} Zeichen.",
  "projects.error.loadFailed": "Projekte konnten nicht geladen werden",
  "projects.error.nameRequired": "Projektname ist erforderlich",
  "projects.error.switchFailed":
    "Projektwechsel fehlgeschlagen. Bitte erneut versuchen.",
  "projects.error.updateFailed":
    "Projekt konnte nicht aktualisiert werden. Bitte erneut versuchen.",
  "projects.filters.sort.newest": "Neueste zuerst",
  "projects.filters.sort.oldest": "Älteste zuerst",
  "projects.filters.sort.placeholder": "Sortieren nach",
  "projects.filters.status.active": "Aktiv",
  "projects.filters.status.all": "Alle Status",
  "projects.filters.status.inactive": "Inaktiv",
  "projects.form.description.count": "{{count}} / {{max}} Zeichen",
  "projects.form.description.label": "Beschreibung",
  "projects.form.description.limitExceeded": "Limit überschritten",
  "projects.form.description.placeholder": "Beschreiben Sie dieses Projekt...",
  "projects.form.name.label": "Projektname",
  "projects.form.name.placeholder": "z. B. Marketing-Dokumente",
  "projects.list.created": "Erstellt {{date}}",
  "projects.loading": "Projekte werden geladen...",
  "projects.search.placeholder": "Projekte suchen...",
  "projects.subtitle":
    "Verwalten und wechseln Sie zwischen allen Ihren Projekten ({{count}} insgesamt)",
  "projects.switch.a11y.current": "Aktuelles Projekt: {{name}}",
  "projects.switch.a11y.trigger": "Projekt wechseln",
  "projects.switch.subtitle":
    "Wählen Sie ein Projekt aus, an dem Sie arbeiten möchten.",
  "projects.switch.title": "Projekt wechseln",
  "projects.title": "Alle Projekte",
  "projects.toast.created.description": '"{{name}}" wurde erfolgreich erstellt',
  "projects.toast.created.title": "Projekt erstellt",
  "projects.toast.deleted.description": '"{{name}}" wurde erfolgreich gelöscht',
  "projects.toast.deleted.title": "Projekt gelöscht",
  "projects.toast.updated.description":
    '"{{name}}" wurde erfolgreich aktualisiert',
  "projects.toast.updated.title": "Projekt aktualisiert",
  "rag-tuning.description":
    "Testen und optimieren Sie Ihre Retrieval-Augmented Generation Einstellungen",
  "rag-tuning.title": "RAG-Anpassung Spielplatz",
  "resetPassword.field.confirmPassword": "Neues Passwort bestätigen",
  "resetPassword.field.confirmPasswordPlaceholder": "Neues Passwort bestätigen",
  "resetPassword.field.newPasswordPlaceholder": "Neues Passwort eingeben",
  "resetPassword.field.username": "Benutzername",
  "search.citations.colours.accent": "Akzent",
  "search.citations.colours.default": "Standard",
  "search.citations.colours.helper": "Farbthema der Zitate",
  "search.citations.colours.label": "Farbschema",
  "search.citations.colours.muted": "Gedämpft",
  "search.citations.colours.primary": "Primär",
  "search.citations.description":
    "Konfigurieren Sie die Anzeige von Zitaten in Suchantworten",
  "search.citations.displayOptions.showSnippets": "Ausschnitte anzeigen",
  "search.citations.displayOptions.showSnippetsHelper":
    "Inhaltsausschnitte anzeigen",
  "search.citations.displayOptions.showSourceCount": "Quellenanzahl anzeigen",
  "search.citations.displayOptions.showSourceCountHelper":
    "Anzahl der Quellen anzeigen",
  "search.citations.displayOptions.showUrls": "URLs anzeigen",
  "search.citations.displayOptions.showUrlsHelper": "Quellenlinks anzeigen",
  "search.citations.displayOptions.title": "Anzeigeoptionen",
  "search.citations.empty": "Keine Zitationseinstellungen verfügbar",
  "search.citations.layout.grid": "Raster",
  "search.citations.layout.helper": "Anordnung der Zitate",
  "search.citations.layout.vertical": "Vertikal",
  "search.citations.loading": "Zitationseinstellungen werden geladen...",
  "search.citations.numbering.helper": "Wie Zitate nummeriert werden",
  "search.citations.numbering.label": "Nummerierungsstil",
  "search.citations.preview.label": "Vorschau:",
  "search.citations.preview.text":
    "Dies ist ein Beispielauszug, der zeigt, wie der Text gekürzt wird, wenn er die maximale Länge überschreitet. ",
  "search.citations.reset": "Zurücksetzen",
  "search.citations.reset.a11y": "Zitatformatierung zurücksetzen",
  "search.citations.save": "Änderungen speichern",
  "search.citations.save.a11y":
    "Speichern Sie Änderungen an der Zitatformatierung",
  "search.citations.snippetLength.helper":
    "Maximale Länge der Inhaltsausschnitte",
  "search.citations.snippetLength.label": "Max. Ausschnittlänge",
  "search.citations.snippetLength.value": "{{count}} Zeichen",
  "search.citations.style.card": "Karte",
  "search.citations.style.compact": "Kompakt",
  "search.citations.style.detailed": "Detailliert",
  "search.citations.style.helper": "Auswählen, wie Zitate angezeigt werden",
  "search.citations.style.label": "Zitationsstil",
  "search.citations.title": "Zitationsformatierung",
  "search.citations.unavailable": "Zitiereinstellungen nicht verfügbar.",
  "search.config.backgroundLabel": "Hintergrund",
  "search.config.borderRadius.mediumRounded": "Mittel abgerundet",
  "search.config.borderRadius.rounded": "Abgerundet",
  "search.config.borderRadius.semiRounded": "Halb abgerundet",
  "search.config.borderRadius.square": "Eckig",
  "search.config.borderRadiusLabel": "Rahmenradius",
  "search.config.description":
    "Konfigurieren Sie Einstellungen und Erscheinungsbild des Suchfelds",
  "search.config.feedbackEnabled.description":
    "Wenn deaktiviert, blendet das Such-Widget Feedback-Steuerelemente aus und speichert kein neues Feedback.",
  "search.config.feedbackEnabled.label": "Nutzer-Feedback sammeln",
  "search.config.icon.error":
    "Das Suchsymbol funktioniert nur, wenn der Formulartyp auf „Standard“ gesetzt ist",
  "search.config.icon.pickerTitle": "Suchsymbol",
  "search.config.icon.scan": "Scannen",
  "search.config.icon.search": "Suchen",
  "search.config.icon.sparkles": "Glanz",
  "search.config.iconLabel": "Suchsymbol",
  "search.config.languageLabel": "Sprache",
  "search.config.loader.skeleton": "Skelett",
  "search.config.loader.typing": "Tipp-Loader",
  "search.config.loaderLabel": "Loader auswählen",
  "search.config.loading": "Konfiguration wird geladen...",
  "search.config.save": "Konfiguration speichern",
  "search.config.saving": "Sparen...",
  "search.config.styleCustom": "Stil anpassen",
  "search.config.styleDefault": "Standard",
  "search.config.styleHelper":
    "Stil für Suchfeld und Ergebnisse auswählen (Standard entspricht dem Farbschema der Website)",
  "search.config.styleLabel": "Stil auswählen",
  "search.config.title": "Suchfeld-Konfiguration",
  "search.config.titleLabel": "Titel",
  "search.config.titlePlaceholder": "Suchfeld",
  "search.config.toast.saved.description":
    "Die Suchfeld-Konfiguration wurde erfolgreich gespeichert.",
  "search.config.toast.saved.title": "Konfiguration gespeichert",
  "search.config.toast.saveError":
    "Suchkonfiguration konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  "search.config.unavailable": "Suchfeldkonfiguration nicht verfügbar.",
  "search.customisation.buttonText.default": "Suchen",
  "search.customisation.buttonText.label": "Text des Suchbuttons",
  "search.customisation.buttonText.placeholder": "Suchen",
  "search.customisation.buttonType.error":
    "Button-Typ funktioniert nur, wenn der Suchformulartyp auf „Mit Button“ gesetzt ist",
  "search.customisation.buttonType.icon": "Suchsymbol",
  "search.customisation.buttonType.label": "Button-Typ",
  "search.customisation.buttonType.withLabel": "Mit Label",
  "search.customisation.description":
    "Formular und Verhalten des Suchfelds anpassen",
  "search.customisation.formType.default": "Standard",
  "search.customisation.formType.label": "Suchformulartyp",
  "search.customisation.formType.withButton": "Mit Button",
  "search.customisation.inputPlaceholder.label": "Platzhalter im Suchfeld",
  "search.customisation.inputPlaceholder.placeholder": "Mit KI suchen...",
  "search.customisation.loading": "Anpassung wird geladen...",
  "search.customisation.recentSearch.helper":
    "Verlauf der letzten Suchen aktivieren",
  "search.customisation.recentSearch.label": "Letzte Suche",
  "search.customisation.recentSearch.titleLabel": "Titel der letzten Suchen",
  "search.customisation.recentSearch.titlePlaceholder": "Letzte Suchen",
  "search.customisation.save": "Anpassung speichern",
  "search.customisation.title": "Suchfeld-Anpassung",
  "search.customisation.toast.saved.description":
    "Die Suchfeld-Anpassung wurde erfolgreich gespeichert.",
  "search.customisation.toast.saved.title": "Anpassung gespeichert",
  "search.customisation.toast.saveError":
    "Suchanpassung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  "search.customisation.unavailable": "Anpassung nicht verfügbar.",
  "search.description":
    "Konfigurieren und verwalten Sie Training, Einstellungen und Integrationen der Suche",
  "search.domains.addButton": "Hinzufügen",
  "search.domains.addButton.a11y": "URL hinzufügen",
  "search.domains.addUrl.a11y": "Fügen Sie die zulässige URL hinzu",
  "search.domains.addUrl.subtitle":
    "Geben Sie eine vollständige Website- oder Seiten-URL ein. Wir entfernen Hashes, ignorieren Abfrageparameter und normalisieren abschließende Schrägstriche.",
  "search.domains.addUrl.title": "Fügen Sie die zulässige URL hinzu",
  "search.domains.allowedUrls.title": "Erlaubte URLs",
  "search.domains.description":
    "Konfigurieren Sie, welche Domains Ihr Such-Widget verwenden dürfen",
  "search.domains.empty.description":
    "Zulässige URLs sind erforderlich. Fügen Sie mindestens einen Eintrag hinzu, um Widgets zu aktivieren.",
  "search.domains.empty.label": "Keine Zulassungsliste konfiguriert",
  "search.domains.empty.subtitle":
    "Noch keine URLs konfiguriert. Fügen Sie mindestens einen Eintrag hinzu, damit Widgets funktionieren.",
  "search.domains.entries": "{{count}} Einträge",
  "search.domains.entry": "{{count}}-Eintrag",
  "search.domains.loading": "Domänen werden geladen...",
  "search.domains.remove.a11y": "{{domain}} entfernen",
  "search.domains.scope.a11y": "URL-Bereich",
  "search.domains.scope.entireSite": "Gesamte Website",
  "search.domains.scope.pageAndSubpaths": "Seite + Unterpfade",
  "search.domains.scope.pageOnly": "Nur diese Seite",
  "search.domains.scopeLabel": "Umfang",
  "search.domains.title": "Zugelassene Domains",
  "search.domains.validation.a11y": "So funktioniert die Domänenvalidierung",
  "search.domains.validation.bullet1":
    "Zulässige URLs sind erforderlich – Widgets funktionieren nur bei konfigurierten Einträgen.",
  "search.domains.validation.bullet2":
    "Sie müssen mindestens eine URL hinzufügen, damit Widgets funktionieren.",
  "search.domains.validation.bullet3":
    "URLs werden normalisiert (www entfernt, Pfade beibehalten, abschließende Schrägstriche gekürzt).",
  "search.domains.validation.bullet4":
    "Nicht autorisierte Domänen erhalten den Fehler 403 Forbidden.",
  "search.domains.validation.bullet5":
    "Die Domänenvalidierung gilt sowohl für Chatbots als auch für Such-Widgets.",
  "search.domains.validation.bullet6":
    "Sie können eine ganze Site oder eine einzelne Seite (mit optionalen Unterpfaden) zulassen.",
  "search.domains.validation.title": "So funktioniert die Domänenvalidierung:",
  "search.embedding.reindex.button.idle": "Jetzt neu indizieren",
  "search.embedding.reindex.button.running": "Wird neu indiziert …",
  "search.embedding.reindex.failed.title": "Reindex fehlgeschlagen",
  "search.embedding.reindex.lastRun.failed":
    "Letzte Neuindizierung fehlgeschlagen: {{detail}}",
  "search.embedding.reindex.lastRun.incomplete":
    "Die letzte Neuindizierung wurde abgeschlossen, aber {{missing}} Elemente sind immer noch nicht eingebettet. Versuchen Sie es erneut.",
  "search.embedding.reindex.partial.body":
    "{{embedded}}/{{total}} eingebettet; {{failed}} fehlgeschlagen.",
  "search.embedding.reindex.partial.title": "Reindex mit Fehlern beendet",
  "search.embedding.reindex.progress": "Reindex {{done}} / {{total}}",
  "search.embedding.reindex.success.body":
    "{{embedded}}/{{total}} Dokument(e) mit dem aktiven Modell eingebettet.",
  "search.embedding.reindex.success.title": "Reindex abgeschlossen",
  "search.embedding.status.a11y": "Einbetten des Neuindizierungsstatus",
  "search.embedding.status.allEmbedded.body":
    "{{count}} Vektoren für {{model}} gespeichert.",
  "search.embedding.status.allEmbedded.title":
    "Alle Dokumente sind mit diesem Modell eingebettet",
  "search.embedding.status.coverageSummary":
    "{{embedded}} von {{total}} Elementen eingebettet.",
  "search.embedding.status.empty.body":
    "Dokumente hochladen oder Quelle crawlen. Sie werden mit {{model}} eingebettet.",
  "search.embedding.status.empty.title": "Noch keine Dokumente",
  "search.embedding.status.emptyIndexed.body":
    "Fügen Sie Crawling-Quellen oder Dokumente hinzu und indizieren Sie dann für {{model}} neu.",
  "search.embedding.status.emptyIndexed.title": "Noch kein indizierter Inhalt",
  "search.embedding.status.error.title":
    "Embedding-Status konnte nicht geladen werden",
  "search.embedding.status.fallbackWarning":
    "Gespeicherte Einstellungen konnten Ihren API-Schlüssel nicht verwenden. Überprüfen Sie stattdessen das Standardmodell ({{model}}). Fügen Sie einen gültigen API-Schlüssel hinzu und speichern Sie erneut.",
  "search.embedding.status.loadFailed":
    "Der Einbettungsstatus konnte nicht geladen werden",
  "search.embedding.status.loading": "Embeddings werden geprüft …",
  "search.embedding.status.loadingStatus": "Einbettungsstatus wird geladen…",
  "search.embedding.status.needsReindex.body":
    "Es gibt {{total}} Dokument(e), die noch nicht mit {{model}} eingebettet sind. Reindex starten, um sie in den Suchergebnissen anzuzeigen.",
  "search.embedding.status.needsReindex.title":
    "Einige Dokumente sind nicht mit diesem Modell eingebettet",
  "search.embedding.status.needsReindexDetail":
    "{{embedded}} von {{total}} Elementen eingebettet. {{missing}} fehlt für {{model}}.",
  "search.embedding.status.needsReindexRecommended.title":
    "Für dieses Einbettungsmodell wird eine Neuindizierung empfohlen",
  "search.embedding.status.otherCollections":
    "{{count}} weitere Embedding(s) dieses Projekts enthalten noch ältere Vektoren.",
  "search.embedding.status.refresh": "Aktualisieren",
  "search.embedding.status.refreshA11y": "Einbettungsstatus aktualisieren",
  "search.history.confirm.deleteOne.title": "Sitzung löschen?",
  "search.history.confirm.deleteSelected.message":
    "{{count}} Sitzung(en) entfernen? Dies kann nicht rückgängig gemacht werden.",
  "search.history.confirm.deleteSelected.title":
    "Ausgewählte Sitzungen löschen?",
  "search.history.copyResponse.a11y": "Antwort kopieren",
  "search.history.deleteAll": "Alle löschen",
  "search.history.deleteAll.confirm":
    "Möchten Sie den gesamten Suchverlauf löschen? Dies kann nicht rückgängig gemacht werden.",
  "search.history.deleteAll.description":
    "Gesamter Suchverlauf wurde gelöscht.",
  "search.history.deleteAll.error":
    "Gesamter Suchverlauf konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  "search.history.deleteAll.title": "Gelöscht",
  "search.history.deleteConversation.description":
    "Suchverlauf erfolgreich gelöscht.",
  "search.history.deleteConversation.error":
    "Suchverlauf konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  "search.history.deleteConversation.title": "Gelöscht",
  "search.history.deleteSelected": "Auswahl löschen ({{count}})",
  "search.history.deleteSelected.description":
    "{{count}} Suchen erfolgreich gelöscht.",
  "search.history.deleteSelected.error":
    "Einige Suchen konnten nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  "search.history.deleteSelected.title": "Gelöscht",
  "search.history.deleteSession.a11y": "Sitzung löschen",
  "search.history.description": "Suchverlauf anzeigen und filtern",
  "search.history.empty": "Keine Unterhaltungen gefunden",
  "search.history.emptyState.action": "Gehen Sie zu Suchtest",
  "search.history.emptyState.body":
    "Der Suchverlauf speichert jede von Ihnen ausgeführte Abfrage. Öffnen Sie die Registerkarte „Suchtest“, führen Sie eine Suche durch. Ihre Sitzungen werden hier angezeigt, sodass Sie Antworten und Quellen überprüfen können.",
  "search.history.emptyState.title": "Noch kein Suchverlauf",
  "search.history.filter.allTime": "Gesamte Zeit",
  "search.history.filter.last30Days": "Letzte 30 Tage",
  "search.history.filter.last7Days": "Letzte 7 Tage",
  "search.history.filter.lastYear": "Letztes Jahr",
  "search.history.filter.placeholder": "Nach Datum filtern",
  "search.history.filter.today": "Heute",
  "search.history.filterEmpty.body":
    "Versuchen Sie es mit einem anderen Suchbegriff oder ändern Sie den Zeitraum.",
  "search.history.filterEmpty.title":
    "Keine Sitzungen entsprechen Ihren Filtern",
  "search.history.filters": "Filter",
  "search.history.filtersActive": "Filter, {{count}} aktiv",
  "search.history.loadError":
    "Suchverlauf konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
  "search.history.loading": "Suchverlauf wird geladen...",
  "search.history.messageCount": "Anzahl der Suchen: {{count}}",
  "search.history.mock.general": "Allgemein",
  "search.history.mock.query1": "Was ist KI?",
  "search.history.mock.query2": "Wie funktioniert maschinelles Lernen?",
  "search.history.mock.query3": "Hilfe bei der Konfiguration",
  "search.history.mock.response1": "KI steht für Künstliche Intelligenz...",
  "search.history.mock.response2":
    "Maschinelles Lernen ist eine Teilmenge der KI...",
  "search.history.mock.response3":
    "Ich kann Ihnen bei der Konfiguration helfen...",
  "search.history.mock.support": "Unterstützung",
  "search.history.mock.technical": "Technisch",
  "search.history.newConversation": "Neue Unterhaltung",
  "search.history.search.a11y": "Gespräche durchsuchen",
  "search.history.search.placeholder": "Unterhaltungen suchen...",
  "search.history.searchQuery": "Suchanfrage",
  "search.history.selectAll": "Alle auswählen",
  "search.history.selectAllVisible": "Wählen Sie alle sichtbaren Sitzungen aus",
  "search.history.selectConversation":
    "Wählen Sie eine Unterhaltung aus, um Nachrichten zu sehen",
  "search.history.selectSession.body":
    "Wählen Sie eine Sitzung aus der Liste aus, um die vollständige Antwort, Zitate und Quellen zu lesen.",
  "search.history.selectSession.title": "Wählen Sie eine Suchsitzung aus",
  "search.history.sessionNotFound.body":
    "Diese Sitzung wurde möglicherweise gelöscht oder wird noch geladen.",
  "search.history.sessionNotFound.title": "Sitzung nicht gefunden",
  "search.history.sessions": "Sitzungen",
  "search.history.sources.topK": "Top-K: {{topK}} Quellen ({{count}}):",
  "search.history.title": "Suchverlauf",
  "search.history.viewSource": "Quelle anzeigen →",
  "search.history.viewSourceA11y": "Quelle ansehen {{title}}",
  "search.integrations.copyFailed":
    "Snippet konnte nicht kopiert werden. Bitte versuchen Sie es erneut.",
  "search.integrations.mobile.copy.description":
    "Mobile SDK-Code in die Zwischenablage kopiert",
  "search.integrations.mobile.copy.title": "Kopiert",
  "search.integrations.mobile.description":
    "Such-SDK in Ihre mobile App integrieren",
  "search.integrations.mobile.instructions.configure":
    "Setzen Sie projectId, apiKey (rgs_live_…), endpoint und features: ['search']",
  "search.integrations.mobile.instructions.importInit":
    "Umschließen Sie Ihre App mit SafeAreaProvider und RAGSuiteProvider",
  "search.integrations.mobile.instructions.install":
    "Expo: npx expo install @ragsuite/react-native react-native-safe-area-context expo-blur expo-linear-gradient expo-clipboard | CLI: npm install @ragsuite/react-native react-native-safe-area-context @react-native-community/blur react-native-linear-gradient @react-native-clipboard/clipboard",
  "search.integrations.mobile.instructions.start":
    "Rendern Sie RAGSuiteSearch innerhalb von RAGSuiteProvider",
  "search.integrations.mobile.instructions.title": "Installationsanleitung:",
  "search.integrations.mobile.regenerate": "Neu generieren",
  "search.integrations.mobile.script.commentTitle": "Mobile SDK-Integration",
  "search.integrations.mobile.scriptLabel": "Mobile SDK-Code",
  "search.integrations.snippetUnavailable":
    "Integrationsausschnitt nicht verfügbar.",
  "search.integrations.web.copy.description":
    "Web-Skript in die Zwischenablage kopiert",
  "search.integrations.web.copy.title": "Kopiert",
  "search.integrations.web.description":
    "Such-Widget auf Ihrer Website einbetten",
  "search.integrations.web.regenerate.button": "Neu generieren",
  "search.integrations.web.regenerate.description":
    "Such-Widget-Skript wurde neu generiert",
  "search.integrations.web.regenerate.title": "Neu generiert",
  "search.integrations.web.script.commentAdvanced":
    "Alternative: Erweiterte Konfiguration",
  "search.integrations.web.script.commentPlacement":
    "Fügen Sie dieses Skript vor dem schließenden </body>-Tag ein",
  "search.integrations.web.script.commentTitle": "RAG Suite Such-Widget",
  "search.integrations.web.script.sampleTitle": "Suchassistent",
  "search.integrations.web.script.sampleWelcome":
    "Hallo. Ich helfe Ihnen, Informationen zu finden.",
  "search.integrations.web.scriptLabel": "Web-Widget-Skript",
  "search.integrations.web.title": "Web-Integration",
  "search.languages.ar": "Arabisch",
  "search.languages.de": "Deutsch",
  "search.languages.en": "Englisch (US)",
  "search.languages.enGb": "Englisch (UK)",
  "search.languages.es": "Spanisch",
  "search.languages.fr": "Französisch",
  "search.languages.pt": "Portugiesisch (Brasilien)",
  "search.languages.zh": "Chinesisch (vereinfacht)",
  "search.models.apiKey.helper": "API-Schlüssel für den ausgewählten Anbieter",
  "search.models.apiKey.label": "API-Schlüssel",
  "search.models.apiKey.ollamaHelper":
    "API-Schlüssel wird für den Ollama-Anbieter automatisch gesetzt",
  "search.models.apiKey.ollamaPlaceholder": "Für Ollama automatisch ausgefüllt",
  "search.models.apiKey.placeholder": "API-Schlüssel eingeben",
  "search.models.apiKey.savedPlaceholder":
    "Neuen Schlüssel eingeben zum Ersetzen",
  "search.models.chatModel.helper": "Modell für Chat/Completion-Aufgaben",
  "search.models.chatModel.label": "Chat-Modell",
  "search.models.chatModel.noneAvailable": "Keine Modelle verfügbar",
  "search.models.chatModel.placeholder": "Modell auswählen",
  "search.models.chatModel.selectProvider": "Zuerst einen Anbieter auswählen",
  "search.models.description":
    "KI-Modellanbieter und Modellauswahl konfigurieren",
  "search.models.embeddingModel.helper": "Modell für Embeddings (optional)",
  "search.models.embeddingModel.helperFallback":
    "Kein Modell ausgewählt — Jina (Standard) wird verwendet.",
  "search.models.embeddingModel.label": "Embedding-Modell",
  "search.models.embeddingModel.none": "Keine (optional)",
  "search.models.embeddingModel.noneAvailable":
    "Keine Embedding-Modelle für diesen Anbieter verfügbar",
  "search.models.embeddingModel.placeholder":
    "Embedding-Modell auswählen (optional)",
  "search.models.embeddingModel.selectProvider":
    "Zuerst einen Anbieter auswählen",
  "search.models.loading": "Modelleinstellungen werden geladen...",
  "search.models.parameters.bestOf": "Das Beste von",
  "search.models.parameters.frequencyPenalty": "Frequenzstrafe",
  "search.models.parameters.frequencyPenaltyHint":
    "(chatgpt.openai_frequenz_penalty [Zeichenfolge])",
  "search.models.parameters.presencePenalty": "Anwesenheitsstrafe",
  "search.models.parameters.temperature": "Temperatur",
  "search.models.parameters.topPHint": "(chatgpt.openai_top_p [Zeichenfolge])",
  "search.models.provider.label": "Modellanbieter",
  "search.models.provider.loading": "Anbieter werden geladen...",
  "search.models.provider.placeholder": "Anbieter auswählen",
  "search.models.rag.maxTokens": "Maximale Tokens",
  "search.models.rag.maxTokensHelp.long":
    "Minimum: 400 Tokens (für LANGE Antworten). 0 = unbegrenzt, max 3000",
  "search.models.rag.maxTokensHelp.short":
    "Minimum: 200 Tokens (für KURZE Antworten). 0 = unbegrenzt, max 3000",
  "search.models.rag.similarityThreshold": "Ähnlichkeitsschwelle",
  "search.models.rag.similarityThresholdHelper":
    "Minimale Ähnlichkeitsbewertung für die Dokumentaufnahme",
  "search.models.rag.topK": "Top-K-Ergebnisse",
  "search.models.rag.topKHelper":
    "Anzahl der Dokumente aus der Vektordatenbank",
  "search.models.rag.unlimited": "Unbegrenzt",
  "search.models.rag.useReranker": "Reranker verwenden",
  "search.models.rag.useRerankerHelper": "Relevanz durch Reranking verbessern",
  "search.models.save": "Modelleinstellungen speichern",
  "search.models.saveError.fallback":
    "Modelleinstellungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  "search.models.title": "Modelleinstellungen",
  "search.models.unavailable": "Modelleinstellungen nicht verfügbar.",
  "search.models.validationError.description":
    "Bitte geben Sie einen gültigen API-Schlüssel ein",
  "search.models.validationError.title": "Validierungsfehler",
  "search.primaryTab.a11y": "Registerkarte {{label}}",
  "search.prompt.default": "Sie sind ein hilfreicher KI-Assistent...",
  "search.prompt.description":
    "Passen Sie den System-Prompt für Ihre Suchkonfiguration an",
  "search.prompt.helper":
    "Dieser Prompt definiert das Verhalten und die Persönlichkeit des Assistenten",
  "search.prompt.label": "System-Prompt",
  "search.prompt.loading": "Prompt wird geladen...",
  "search.prompt.placeholder": "Geben Sie Ihren System-Prompt ein...",
  "search.prompt.save": "Prompt speichern",
  "search.prompt.saving": "Wird gespeichert...",
  "search.prompt.title": "Prompt bearbeiten",
  "search.questions.answer.close": "Antwort schließen",
  "search.questions.answer.edit": "Antwort hinzufügen/bearbeiten",
  "search.questions.answer.helper":
    "Diese Antwort wird angezeigt, wenn Nutzer auf diese Frage klicken",
  "search.questions.answer.label": "Vordefinierte Antwort",
  "search.questions.answer.loading": "Vordefinierte Antwort wird geladen...",
  "search.questions.answer.placeholder":
    "Geben Sie eine vordefinierte Antwort für diese Frage ein...",
  "search.questions.answer.testPlaceholder":
    "Optionale vorgefertigte Antwort für den Suchtest",
  "search.questions.description": "Vorgeschlagene Fragen für Nutzer verwalten",
  "search.questions.enable.helper":
    "Vorgeschlagene Fragen in der Suchleiste anzeigen",
  "search.questions.enable.label": "Vordefinierte Fragen aktivieren",
  "search.questions.limit.label": "Fragenlimit",
  "search.questions.list.label": "Fragen",
  "search.questions.list.placeholder": "Frage eingeben...",
  "search.questions.loading": "Einstellungen werden geladen...",
  "search.questions.save": "Änderungen speichern",
  "search.questions.title": "Konfiguration vordefinierter Fragen",
  "search.settings.citations": "Zitationsformatierung",
  "search.settings.citationsShort": "Zitate",
  "search.settings.configShort": "Konfig",
  "search.settings.configuration": "Konfiguration",
  "search.settings.customisation": "Anpassung",
  "search.settings.customShort": "Anpassung",
  "search.settings.domains": "Zugelassene Domains",
  "search.settings.models": "Modelleinstellungen",
  "search.settings.modelsShort": "Modelle",
  "search.settings.overview": "Übersicht",
  "search.settings.preview.allowedDomains": "Zugelassene Domains",
  "search.settings.preview.allowedUrls": "Zugelassene URLs:",
  "search.settings.preview.allowlist": "Zulassungsliste:",
  "search.settings.preview.apiKeyLabel": "API-Schlüssel:",
  "search.settings.preview.buttonType": "Button-Typ:",
  "search.settings.preview.buttonType.iconOnly": "Nur Symbol",
  "search.settings.preview.buttonType.withLabel": "Mit Label",
  "search.settings.preview.citations": "Zitate",
  "search.settings.preview.configuredCount": "{{count}} konfiguriert",
  "search.settings.preview.customisation": "Anpassung",
  "search.settings.preview.description":
    "Live-Vorschau aller Einstellungskonfigurationen",
  "search.settings.preview.disabled": "Deaktiviert",
  "search.settings.preview.embeddingModel": "Einbettung: {{model}}",
  "search.settings.preview.enabled": "Aktiviert",
  "search.settings.preview.formType": "Formulartyp:",
  "search.settings.preview.formType.default": "Standard",
  "search.settings.preview.formType.withButton": "Mit Button",
  "search.settings.preview.iconLabel": "Symbol:",
  "search.settings.preview.languageLabel": "Sprache:",
  "search.settings.preview.models": "Modelle",
  "search.settings.preview.moreCount": "+{{count}} weitere",
  "search.settings.preview.noDomains": "Keine Domains konfiguriert",
  "search.settings.preview.numbering": "Nummerierung:",
  "search.settings.preview.questions": "Fragen:",
  "search.settings.preview.recentSearch": "Letzte Suche:",
  "search.settings.preview.searchConfig": "Suchkonfig",
  "search.settings.preview.style": "Stil:",
  "search.settings.preview.styleLabel": "Stil:",
  "search.settings.preview.title": "Vorschau der Einstellungskonfiguration",
  "search.settings.preview.titleLabel": "Titel:",
  "search.settings.preview.unavailable":
    "Einstellungsübersicht nicht verfügbar.",
  "search.settings.questions": "Fragen",
  "search.settings.questionsShort": "Fragen",
  "search.settings.subtitle":
    "Konfigurieren Sie Modell, Suchfeld, Domänen und Integrationen.",
  "search.settings.title": "Einstellungen",
  "search.settings.toast.saved.description":
    "Ihre Sucheinstellungen wurden erfolgreich gespeichert.",
  "search.settings.toast.saved.title": "Einstellungen gespeichert",
  "search.tabs.integrations": "Integrationen",
  "search.tabs.integrationsCompact": "Integrationen",
  "search.tabs.searchTest": "Suchtest",
  "search.tabs.searchTestCompact": "Prüfen",
  "search.tabs.settings": "Einstellungen",
  "search.tabs.training": "Ausbildung",
  "search.test.clearA11y": "Suche löschen",
  "search.test.clearSearchAria": "Suche löschen",
  "search.test.copyAnswerA11y": "Antwort kopieren",
  "search.test.copyFailed": "Antwort konnte nicht kopiert werden.",
  "search.test.copySuccess": "Antwort kopiert.",
  "search.test.error.general":
    "Entschuldigung, beim Suchen ist ein Fehler aufgetreten: {{message}}. Bitte versuchen Sie es erneut.",
  "search.test.error.unknown": "Unbekannter Fehler",
  "search.test.error.validation": "Validierungsfehler: {{message}}",
  "search.test.feedback.cancel.a11y": "Feedback abbrechen",
  "search.test.feedback.characters": "{{current}}/{{max}} Zeichen",
  "search.test.feedback.close.a11y": "Feedback-Formular schließen",
  "search.test.feedback.comments.a11y": "Zusätzliche Feedback-Kommentare",
  "search.test.feedback.commentsOptional": "Zusätzliche Kommentare (optional)",
  "search.test.feedback.commentsPlaceholder":
    "Erzählen Sie uns mehr über Ihre Erfahrungen mit dieser Antwort ...",
  "search.test.feedback.negative": "Negatives Feedback",
  "search.test.feedback.positive": "Positives Feedback",
  "search.test.feedback.rate.a11y": "Bewerten Sie {{value}} von 5",
  "search.test.feedback.rating": "Bewertung",
  "search.test.feedback.reason.accurate": "genau",
  "search.test.feedback.reason.clear": "klar",
  "search.test.feedback.reason.complete": "vollständig",
  "search.test.feedback.reason.fast response": "schnelle Reaktion",
  "search.test.feedback.reason.hallucinated": "halluziniert",
  "search.test.feedback.reason.helpful": "hilfreich",
  "search.test.feedback.reason.incorrect": "falsch",
  "search.test.feedback.reason.low quality": "geringe Qualität",
  "search.test.feedback.reason.missing sources": "fehlende Quellen",
  "search.test.feedback.reason.outdated information": "veraltete Informationen",
  "search.test.feedback.reason.poor formatting": "schlechte Formatierung",
  "search.test.feedback.reason.slow response": "langsame Reaktion",
  "search.test.feedback.reason.too technical": "zu technisch",
  "search.test.feedback.reasonsOptional": "Gründe (optional)",
  "search.test.feedback.submit": "Geben Sie Feedback ab",
  "search.test.feedback.submit.a11y": "Geben Sie Feedback ab",
  "search.test.feedback.submitted":
    "Vielen Dank. Ihr Feedback wurde übermittelt.",
  "search.test.feedback.submitting": "Einreichen…",
  "search.test.feedback.thanks": "Vielen Dank für Ihr Feedback.",
  "search.test.pendingResponse": "Suche mit RAG-Einstellungen...",
  "search.test.queryPlaceholder": "Suche mit KI...",
  "search.test.recentSearch.title": "Letzte Suche",
  "search.test.recentSearches.title": "Letzte Suchen",
  "search.test.searchButton": "Suchen",
  "search.test.sources.topK": "Top-K: {{topK}} Quellen ({{count}}):",
  "search.test.sources.viewSource": "Quelle anzeigen →",
  "search.test.sources.viewSourceA11y": "Quelle ansehen {{title}}",
  "search.test.subtitle": "Testen Sie Ihre Suchkonfiguration mit Live-Abfragen",
  "search.test.suggestions.title": "Vorschläge",
  "search.test.thinking": "KI denkt nach...",
  "search.test.time.earlier": "Früher",
  "search.test.time.hoursAgoShort": "Vor {{count}}h",
  "search.test.time.justNow": "Gerade eben",
  "search.test.time.minutesAgoShort": "Vor {{count}}m",
  "search.test.title": "Suchtest",
  "search.test.validation.minChars": "Bitte geben Sie mindestens 3 Zeichen ein",
  "search.time.daysAgo": "vor {{count}} Tagen",
  "search.time.hoursAgo": "vor {{count}} Std.",
  "search.time.justNow": "gerade eben",
  "search.time.minutesAgo": "vor {{count}} Min",
  "search.time.monthsAgo": "vor {{count}} Monaten",
  "search.time.unknown": "Unbekannt",
  "search.time.yearsAgo": "vor {{count}} Jahren",
  "search.title": "Suchkonfiguration",
  "search.training.activeConfig": "Aktive Konfiguration",
  "search.training.activeConfig.unavailable":
    "Keine aktive Trainingskonfiguration.",
  "search.training.activeStatus.active": "Aktiv",
  "search.training.activeStatus.activeBadge": "Aktiv",
  "search.training.activeStatus.activeDescription":
    "Die Suche ist derzeit aktiv",
  "search.training.activeStatus.description":
    "Suchdienst aktivieren oder deaktivieren",
  "search.training.activeStatus.disabled": "Deaktiviert",
  "search.training.activeStatus.enabled": "Aktiviert",
  "search.training.activeStatus.inactive": "Inaktiv",
  "search.training.activeStatus.inactiveDescription":
    "Die Suche ist derzeit inaktiv",
  "search.training.activeStatus.live": "Suche ist live",
  "search.training.activeStatus.loading": "Aktivierungsstatus wird geladen...",
  "search.training.activeStatus.offline": "Suche ist offline",
  "search.training.activeStatus.title": "Aktivstatus",
  "search.training.activeStatus.updating": "Wird aktualisiert...",
  "search.training.configShort": "Konfig",
  "search.training.historyShort": "Verlauf",
  "search.training.overview": "Übersicht",
  "search.training.overview.unavailable": "Keine Trainingsübersicht verfügbar.",
  "search.training.preview.description":
    "Live-Vorschau aller Trainingskonfigurationen",
  "search.training.preview.title": "Vorschau der Trainingskonfiguration",
  "search.training.prompt.chars": "{{count}} Zeichen",
  "search.training.prompt.empty": "Kein Prompt gesetzt",
  "search.training.prompt.length": "Länge:",
  "search.training.prompt.loading": "Prompt wird geladen...",
  "search.training.prompt.title": "System-Prompt",
  "search.training.prompt.words": "Wörter:",
  "search.training.responseConfig.description":
    "Konfigurieren Sie, wie die Suche auf Anfragen reagiert",
  "search.training.responseConfig.loading":
    "Antwortkonfiguration wird geladen...",
  "search.training.responseConfig.title": "Antwortkonfiguration",
  "search.training.responseConfig.toast.description":
    "Antworttyp auf {{type}} gesetzt.",
  "search.training.responseConfig.toast.errorDescription":
    "Antwortkonfiguration konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  "search.training.responseConfig.toast.errorTitle": "Speichern fehlgeschlagen",
  "search.training.responseConfig.toast.title":
    "Antwortkonfiguration gespeichert",
  "search.training.responseType.brief": "Kurz",
  "search.training.responseType.briefHelp":
    "Die Suche liefert kurze, prägnante Antworten",
  "search.training.responseType.detailed": "Detailliert",
  "search.training.responseType.detailedHelp":
    "Die Suche liefert detaillierte, umfassende Antworten",
  "search.training.responseType.label": "Antworttyp",
  "search.training.responseType.long": "Lange Antworten",
  "search.training.responseType.longHelp":
    "Die Suche liefert detaillierte, umfassende Antworten",
  "search.training.responseType.short": "Kurze Antworten",
  "search.training.responseType.shortHelp":
    "Die Suche liefert kurze, prägnante Antworten",
  "search.training.responseType.title": "Antworttyp",
  "search.training.searchHistory": "Suchverlauf",
  "search.training.searchHistory.conversations": "{{count}} Unterhaltungen",
  "search.training.searchHistory.filtered": "Gefiltert: {{filter}}",
  "search.training.searchHistory.title": "Suchverlauf",
  "search.training.searchHistory.total": "{{count}} gesamt",
  "search.training.searchHistory.totalMessages": "Gesamtanzahl Nachrichten:",
  "search.training.searchStatus.label": "Suchstatus",
  "search.training.subtitle":
    "Überwachen Sie die Indizierung, die aktive Konfiguration und den Suchverlauf.",
  "search.training.title": "Ausbildung",
  "search.widget.avatar.default": "Standard {{count}}",
  "search.widget.colors.blue": "Blau",
  "search.widget.colors.darkGray": "Dunkelgrau",
  "search.widget.colors.gradient": "Verlauf",
  "search.widget.colors.green": "Grün",
  "search.widget.colors.purple": "Violett",
  "search.widget.preview.a11y.configuration": "Live-Vorschau des Suchfelds",
  "search.widget.preview.a11y.customisation":
    "Live-Vorschau zur Anpassung des Suchfelds",
  "search.widget.preview.a11y.questions": "Live-Vorschau vordefinierter Fragen",
  "search.widget.preview.input.a11y": "Vorschau der Sucheingabe",
  "search.widget.preview.justNow": "Soeben",
  "search.widget.preview.subtitle":
    "Echtzeitvorschau Ihrer Suchfeldkonfiguration.",
  "search.widget.preview.suggestedQuestions": "Vorgeschlagene Fragen",
  "search.widget.preview.title": "Live-Vorschau",
  "search.widget.toast.avatarUploaded.description":
    "Der benutzerdefinierte Avatar wird gespeichert, wenn Sie auf Speichern klicken.",
  "search.widget.toast.avatarUploaded.title":
    "Benutzerdefinierter Avatar hochgeladen",
  "search.widget.toast.logoUploaded.description":
    "Das Widget-Logo wird gespeichert, wenn Sie auf Speichern klicken.",
  "search.widget.toast.logoUploaded.title": "Widget-Logo hochgeladen",
  "settings.actions.reset": "Zurücksetzen",
  "settings.actions.saveChanges": "Änderungen speichern",
  "settings.api-keys": "API-Schlüssel",
  "settings.audit-logs": "Audit-Protokolle & Compliance",
  "settings.branding.backgroundTheme": "Hintergrundthema",
  "settings.branding.backgroundTheme.geometric": "Geometrisch",
  "settings.branding.backgroundTheme.simple": "Standard",
  "settings.branding.livePreview": "Live-Vorschau",
  "settings.branding.logoHint": "Empfohlen: 64x64px PNG oder SVG",
  "settings.branding.logoPreviewAlt": "Logo-Vorschau",
  "settings.branding.logoRemove": "Entfernen",
  "settings.branding.logoUpload": "Logo hochladen",
  "settings.branding.orgName": "Organisationsname",
  "settings.branding.previewDescription":
    "So erscheint Ihr Branding in der Admin-Oberfläche und im einbettbaren Widget.",
  "settings.branding.primaryButton": "Primäre Schaltfläche",
  "settings.branding.primaryColor": "Primärfarbe",
  "settings.branding.themePresets": "Themenvorgaben",
  "settings.branding.title": "Themenoption",
  "settings.branding.toast.backgroundThemeUpdated.description":
    "Hintergrundthema auf {{theme}} geändert.",
  "settings.branding.toast.backgroundThemeUpdated.title":
    "Hintergrundthema aktualisiert",
  "settings.branding.toast.logoUploaded.description":
    "Die Logo-Vorschau wurde aktualisiert.",
  "settings.branding.toast.logoUploaded.title": "Logo hochgeladen",
  "settings.branding.toast.reset.description":
    "Branding-Einstellungen wurden auf Standardwerte zurückgesetzt.",
  "settings.branding.toast.reset.title": "Branding zurückgesetzt",
  "settings.branding.toast.resetFailed.description":
    "Branding-Einstellungen konnten nicht zurückgesetzt werden.",
  "settings.branding.toast.resetFailed.title": "Zurücksetzen fehlgeschlagen",
  "settings.citation-formatting": "Zitierformat",
  "settings.data-retention": "Datenaufbewahrung",
  "settings.description":
    "Verwalten Sie Ihre Organisationseinstellungen und Präferenzen",
  "settings.feedback.dismissError": "Fehlermeldung verwerfen",
  "settings.i18n": "Internationalisierung",
  "settings.i18n.defaultLanguage": "Standardsprache",
  "settings.i18n.description":
    "Standardsprache für die Admin-Oberfläche und KI-Antworten",
  "settings.i18n.save": "Sprache speichern",
  "settings.i18n.title": "Internationalisierung",
  "settings.i18n.toast.reset.description":
    "Standardsprache auf {{language}} zurückgesetzt.",
  "settings.i18n.toast.reset.title": "Sprache zurückgesetzt",
  "settings.i18n.toast.saved.description":
    "Standardsprache auf {{language}} gesetzt.",
  "settings.i18n.toast.saved.title": "Sprache gespeichert",
  "settings.n8n": "n8n-Integration",
  "settings.profile": "Profil & Marke",
  "settings.retention.autoDelete.description":
    "Entfernt automatisch alte Datensätze, sobald das Aufbewahrungslimit erreicht ist.",
  "settings.retention.autoDelete.label": "Automatisches Löschen aktivieren",
  "settings.retention.confirmation.error":
    "Geben Sie DELETE ein, um die kürzere Aufbewahrung zu bestätigen.",
  "settings.retention.confirmation.label": "Sicherheitsbestätigung",
  "settings.retention.confirmation.placeholder": "Geben Sie DELETE ein",
  "settings.retention.days.label": "Aufbewahrungstage",
  "settings.retention.days.rangeHint":
    "Wählen Sie einen Wert zwischen {{min}} und {{max}} Tagen.",
  "settings.retention.period.hint":
    "Anzahl der Tage zur Aufbewahrung von Benutzeranfragen, Antworten und Feedback",
  "settings.retention.period.label": "Aufbewahrungszeitraum (Tage)",
  "settings.retention.policy.rule1":
    "Abfrageprotokolle und Antworten werden nach {{count}} Tagen automatisch gelöscht",
  "settings.retention.policy.rule2":
    "Feedback- und Analysedaten werden für den gleichen Zeitraum aufbewahrt",
  "settings.retention.policy.rule3":
    "Gecrawlte Dokumente und Embeddings sind davon nicht betroffen",
  "settings.retention.policy.rule4":
    "Systemprotokolle und Audit-Trails folgen separaten Aufbewahrungsregeln",
  "settings.retention.title": "Richtlinie zur Datenaufbewahrung",
  "settings.subtitle":
    "Konfigurieren Sie das Arbeitsbereichserlebnis, die Aufbewahrungsrichtlinie, die Lokalisierung und die Supporteinstellungen.",
  "settings.system-health": "Systemgesundheit",
  "settings.theme.fontScale": "Schriftskala",
  "settings.theme.preview.instantDescription":
    "Sehen Sie sich Updates für Design, Farbe und Schriftgröße sofort in der Vorschau an.",
  "settings.theme.preview.sampleHeading": "Beispieltext für eine Überschrift",
  "settings.title": "Einstellungen",
  "sharepoint.refresh": "Aktualisieren",
  "signup.errors.emailAlreadyInUse": "Diese E-Mail wird bereits verwendet.",
  "signup.errors.generic":
    "Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  "signup.errors.missingFields": "Bitte füllen Sie alle Felder aus",
  "signup.errors.passwordTooShort":
    "Das Passwort muss mindestens 6 Zeichen lang sein",
  "signup.errors.usernameAlreadyInUse":
    "Dieser Benutzername ist bereits vergeben.",
  "signup.form.confirmPassword.label": "Passwort bestätigen",
  "signup.form.confirmPassword.placeholder": "Bestätigen Sie Ihr Passwort",
  "signup.form.email.label": "E-Mail-Adresse",
  "signup.form.email.placeholder": "Geben Sie Ihre E-Mail-Adresse ein",
  "signup.form.password.label": "Passwort",
  "signup.form.password.placeholder": "Geben Sie Ihr Passwort ein",
  "signup.form.submit.label": "Konto erstellen",
  "signup.form.submit.loading": "Konto wird erstellt...",
  "signup.form.username.label": "Benutzername",
  "signup.form.username.placeholder": "Geben Sie Ihren Benutzernamen ein",
  "signup.login.link": "Anmelden",
  "signup.login.prompt": "Haben Sie bereits ein Konto?",
  "signup.subtitle": "Registrieren Sie sich, um mit RAGSuite zu beginnen",
  "signup.subtitle.mobile": "Erstellen Sie Ihr Konto, um loszulegen",
  "signup.title": "Konto erstellen",
  "slack.refresh": "Aktualisieren",
  "system-health.description":
    "Überwachen Sie den Status und die Leistung der Systemdienste",
  "system-health.empty.noServices": "Es sind noch keine Dienste registriert.",
  "system-health.error.title": "Systemgesundheit konnte nicht geladen werden",
  "system-health.error.unknown": "Ein unbekannter Fehler ist aufgetreten",
  "system-health.error.invalidPayload": "Die Systemgesundheitsantwort war unvollständig oder ungültig. Bitte erneut versuchen.",
  "system-health.healthScore": "Gesundheitswert",
  "system-health.legend.atRisk.description": "Dienst könnte bald ausfallen",
  "system-health.legend.degraded.description": "Dienst hat Probleme",
  "system-health.legend.down.description": "Dienst nicht verfügbar",
  "system-health.legend.healthy.description": "Dienst funktioniert normal",
  "system-health.legend.title": "Gesundheitslegende",
  "system-health.loading": "Systemgesundheitsdaten werden geladen...",
  "system-health.overall.lastUpdated": "Zuletzt aktualisiert: {{timestamp}}",
  "system-health.overall.title": "Gesamte Systemgesundheit",
  "system-health.predicted.days": "~{{count}} Tg",
  "system-health.predicted.hours": "~{{count}} Std",
  "system-health.predicted.minutes": "~{{count}} Min",
  "system-health.service.lastHeartbeat": "Letzter Heartbeat",
  "system-health.service.predictedFailure": "Voraussichtlicher Ausfall",
  "system-health.service.reason": "Grund",
  "system-health.service.uptime": "Verfügbarkeit",
  "system-health.services.description":
    "Gesundheitsmetriken und Status einzelner Dienste",
  "system-health.services.title": "Dienststatus",
  "system-health.status.atRisk": "Gefährdet",
  "system-health.status.degraded": "Beeinträchtigt",
  "system-health.status.down": "Ausgefallen",
  "system-health.status.healthy": "Gesund",
  "system-health.status.unknown": "Unbekannt",
  "system-health.time.daysAgo": "vor {{count}} Tg",
  "system-health.time.hoursAgo": "vor {{count}} Std",
  "system-health.time.minutesAgo": "vor {{count}} Min",
  "system-health.time.secondsAgo": "vor {{count}} s",
  "system-health.title": "Systemgesundheit",
  "system-health.toast.refreshed.description":
    "Der Gesundheitsstatus wurde erfolgreich aktualisiert.",
  "system-health.toast.refreshed.title": "Systemgesundheit aktualisiert",
  "system-health.toast.refreshing.description":
    "Aktueller Gesundheitsstatus wird abgerufen...",
  "system-health.toast.refreshing.title": "Systemgesundheit wird aktualisiert",
  "system-health.value.na": "k. A.",
  "theme.dark": "Dunkler Modus",
  "theme.light": "Heller Modus",
  "theme.toggle": "Theme umschalten",
  "tour.completeAction": "Aktion ausführen",
  "tour.completed": "Abgeschlossen",
  "tour.finish": "Fertig",
  "tour.optionalFeature":
    "Diese Funktion ist auf bestimmten Seiten verfügbar. Navigieren Sie dorthin, um sie in Aktion zu sehen!",
  "tour.shortcut": "⌘K oder Strg+K",
  "tour.skip": "Tour überspringen",
  "tour.stepLabel": "Schritt {{current}} von {{total}}",
  "tour.steps.crawlSources.content":
    "Fügen Sie Website-Quellen für das Content-Crawling hinzu und verwalten Sie sie. Hier konfigurieren Sie, welche Inhalte indexiert werden.",
  "tour.steps.crawlSources.title": "Crawl-Quellen",
  "tour.steps.documents.content":
    "Zeigen Sie alle indexierten Dokumente an und verwalten Sie sie. Laden Sie zusätzliche Dateien hoch oder durchsuchen Sie gecrawlte Inhalte.",
  "tour.steps.documents.title": "Dokumentenbibliothek",
  "tour.steps.notifications.action": "Benachrichtigungen anzeigen",
  "tour.steps.notifications.content":
    "Bleiben Sie über Systemwarnungen, Crawl-Status-Updates und wichtige Benachrichtigungen informiert.",
  "tour.steps.notifications.title": "Benachrichtigungen",
  "tour.steps.search.action": "Suche ausprobieren",
  "tour.steps.search.content":
    "Drücken Sie {{shortcut}}, oder klicken Sie hier, um die Befehlspalette für schnelle Navigation und Aktionen zu öffnen.",
  "tour.steps.search.title": "Globale Suche",
  "tour.steps.sidebar.content":
    "Nutzen Sie die Seitenleiste, um zwischen den verschiedenen Bereichen Ihrer Plattform zu navigieren. Von hier aus erreichen Sie alle wichtigen Funktionen.",
  "tour.steps.sidebar.title": "Navigationsleiste",
  "tour.steps.welcome.content":
    "Lassen Sie uns eine kurze Tour machen, um Sie mit Ihrer KI-gestützten Such- und Chatbot-Plattform vertraut zu machen.",
  "tour.steps.welcome.title": "Willkommen bei {{brand}}!",
  "tour.steps.widget.action": "Chat ausprobieren",
  "tour.steps.widget.content":
    "Dies ist Ihr KI-Assistenten-Widget, das auf jeder Website eingebettet werden kann.",
  "tour.steps.widget.title": "Einbettbares Widget",
  "userMenu.accountLabel": "Konto",
  "userMenu.profileDescription": "Verwalten Sie Ihre Kontodetails",
  "userMenu.settingsDescription": "Einstellungen und Konfiguration",
  "userMenu.signOut": "Abmelden",
  "verifyEmail.backToLogin": "Zurück zur Anmeldung",
  "verifyEmail.checkSubtitle":
    "Wir haben einen Bestätigungslink gesendet. Öffnen Sie ihn, um Ihr Konto zu aktivieren, und melden Sie sich dann an.",
  "verifyEmail.checkSubtitleOtp":
    "Wir haben einen 6-stelligen Code an Ihre E-Mail gesendet. Geben Sie ihn unten ein — Sie werden automatisch angemeldet.",
  "verifyEmail.checkTitle": "E-Mail prüfen",
  "verifyEmail.errors.invalidCodeLength":
    "Bitte geben Sie den 6-stelligen Code aus Ihrer E-Mail ein.",
  "verifyEmail.errors.missingEmail": "Bitte geben Sie Ihre E-Mail-Adresse ein.",
  "verifyEmail.errors.missingToken":
    "Bestätigungslink fehlt oder ist ungültig.",
  "verifyEmail.errors.resendFailed":
    "Bestätigungs-E-Mail konnte nicht erneut gesendet werden. Bitte versuchen Sie es später erneut.",
  "verifyEmail.errors.verifyFailed":
    "Bestätigung fehlgeschlagen. Der Link ist möglicherweise abgelaufen oder bereits verwendet.",
  "verifyEmail.form.submit.label": "Bestätigungscode eingeben",
  "verifyEmail.otpLabel": "Bestätigungscode",
  "verifyEmail.redirecting": "Weiterleitung…",
  "verifyEmail.resend.helper":
    "Prüfen Sie Ihren Posteingang auf den 6-stelligen Code. Falls er nicht innerhalb weniger Minuten ankommt, können Sie auf dem nächsten Bildschirm einen neuen Code anfordern.",
  "verifyEmail.resendButton": "Bestätigungs-E-Mail erneut senden",
  "verifyEmail.resending": "Wird gesendet…",
  "verifyEmail.resendSuccess":
    "Falls Ihr Konto noch nicht bestätigt ist, wurde ein neuer Code gesendet.",
  "verifyEmail.subtitle":
    "Wir haben einen Bestätigungscode an Ihre E-Mail gesendet. Geben Sie ihn auf dem nächsten Bildschirm ein, um Ihr Konto zu aktivieren.",
  "verifyEmail.success": "E-Mail bestätigt. Sie werden zur App weitergeleitet…",
  "verifyEmail.successOtherTab":
    "E-Mail bestätigt. Kehren Sie zu Ihrem ursprünglichen Tab zurück — er sollte sich automatisch aktualisieren.",
  "verifyEmail.title": "E-Mail bestätigen",
  "verifyEmail.verifiedElsewhere":
    "E-Mail bestätigt. Sie werden zur App weitergeleitet…",
  "verifyEmail.verifyButton": "Bestätigen und fortfahren",
  "verifyEmail.verifying": "E-Mail-Adresse wird bestätigt…",
  "verifyEmail.verifyTitle": "E-Mail wird bestätigt",
};
