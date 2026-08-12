import { en } from "./en";

export const es: Record<string, string> = {
  ...en,
  "analytics.actions.export": "Exportar",
  "analytics.actions.refresh": "Actualizar análisis",
  "analytics.chart.noDataForPeriod": "No hay datos para este periodo",
  "analytics.charts.dailyQueries": "Consultas diarias",
  "analytics.charts.hardQueries": "Consultas difíciles",
  "analytics.charts.popularQueries": "Consultas populares",
  "analytics.charts.responseLatency": "Latencia de respuesta",
  "analytics.charts.sourceCoverage": "Cobertura de fuentes",
  "analytics.charts.userSatisfaction": "Satisfacción del usuario",
  "analytics.description":
    "Rastrea métricas de rendimiento y compromiso del usuario",
  "analytics.empty.noData": "No hay datos disponibles",
  "analytics.error.loadFailed":
    "No se pudieron cargar los datos de analítica. Inténtalo de nuevo más tarde.",
  "analytics.export.a11y.dismiss": "Cerrar menú de exportación",
  "analytics.format.na": "N/D",
  "analytics.hardQueries.attempts": "{{count}} intentos",
  "analytics.hardQueries.avg": "prom.",
  "analytics.hardQueries.avgLatency": "{{value}} promedio",
  "analytics.hardQueries.description":
    "Consultas con baja satisfacción que necesitan atención",
  "analytics.hardQueries.empty":
    "No hay datos disponibles de consultas difíciles",
  "analytics.hardQueries.title": "Consultas difíciles",
  "analytics.latency": "Latencia",
  "analytics.metrics.avgLatencyP95.title": "Latencia media (p95)",
  "analytics.metrics.dailyAverage.title": "Promedio diario",
  "analytics.metrics.fromLastPeriod": "desde el periodo anterior",
  "analytics.metrics.queriesPerDay": "consultas por día",
  "analytics.metrics.satisfactionRate.title": "Tasa de satisfacción",
  "analytics.metrics.totalQueries.title": "Consultas totales",
  "analytics.popularQueries.count": "{{count}} consultas",
  "analytics.popularQueries.empty":
    "No hay datos disponibles de consultas populares",
  "analytics.queries": "Consultas",
  "analytics.satisfaction": "Satisfacción",
  "analytics.satisfaction.label": "{{value}}% de satisfacción",
  "analytics.sources": "Fuentes",
  "analytics.timeRange.last30Days": "Últimos 30 días",
  "analytics.timeRange.last3Months": "Últimos 3 meses",
  "analytics.timeRange.last7Days": "Últimos 7 días",
  "analytics.title": "Analíticas",
  "analytics.toast.export.error.description":
    "No se pudieron exportar los datos de analítica. Inténtalo de nuevo.",
  "analytics.toast.export.error.title": "Error de exportación",
  "analytics.toast.export.success.description":
    "Los datos de analítica se exportaron correctamente.",
  "analytics.toast.export.success.title": "Exportación exitosa",
  "analytics.toast.refresh.error.description":
    "No se pudieron actualizar los datos de analítica. Inténtalo de nuevo.",
  "analytics.toast.refresh.error.title": "Error al actualizar",
  "analytics.toast.refresh.success.description":
    "Los datos de analítica se han actualizado.",
  "analytics.toast.refresh.success.title": "Datos actualizados",
  "analytics.units.ms": "EM",
  "api-keys.a11y.copyKey": "Copiar clave API",
  "api-keys.a11y.deleteKey": "Eliminar {{name}}",
  "api-keys.a11y.hideKey": "Ocultar clave API",
  "api-keys.a11y.revealKey": "Revelar clave API",
  "api-keys.actions": "Acciones",
  "api-keys.copy": "Copiar",
  "api-keys.create": "Crear Clave API",
  "api-keys.created": "Creado",
  "api-keys.curl.a11y.copyButton": "Copiar comando curl",
  "api-keys.curl.a11y.snippet": "Fragmento de comando curl API",
  "api-keys.curl.copied": "Comando curl copiado al portapapeles",
  "api-keys.curl.copiedShort": "Comando cURL copiado.",
  "api-keys.curl.copyFailed": "No se pudo copiar el comando cURL.",
  "api-keys.curl.description":
    "Utilice Recuperar para la automatización n8n (solo fragmentos). Utilice la búsqueda para obtener respuestas RAG completas.",
  "api-keys.curl.retrieve": "Recuperar (n8n)",
  "api-keys.curl.search": "Búsqueda (RAG completo)",
  "api-keys.curl.title": "Comando de rizo",
  "api-keys.delete.descriptionWithName":
    'Esto revoca permanentemente "{{name}}". Las aplicaciones que utilicen esta clave perderán el acceso.',
  "api-keys.delete.fallbackDescription": "Esto no se puede deshacer.",
  "api-keys.delete.title": "¿Eliminar clave API?",
  "api-keys.description": "Administre sus claves API y tokens de acceso",
  "api-keys.dialog.alert":
    "Guarde esta clave de forma segura. Por razones de seguridad, no podrás volver a verlo.",
  "api-keys.dialog.description":
    "Se ha generado su nueva clave API. Cópialo ahora; no podrás volver a verlo.",
  "api-keys.dialog.title": "Clave API creada",
  "api-keys.empty.description":
    "Cree su primera clave API para comenzar a usar la API.",
  "api-keys.empty.title": "Aún no hay claves API",
  "api-keys.environment": "Ambiente",
  "api-keys.environment.development": "Desarrollo",
  "api-keys.environment.production": "Producción",
  "api-keys.environment.staging": "Puesta en escena",
  "api-keys.expiration.1y": "1 año",
  "api-keys.expiration.30d": "30 dias",
  "api-keys.expiration.90d": "90 dias",
  "api-keys.expiration.never": "Nunca caduca",
  "api-keys.form.descriptionA11y": "Descripción de la clave API",
  "api-keys.form.descriptionOptional": "Descripción (opcional)",
  "api-keys.form.descriptionPlaceholder": "¿Para qué se utilizará esta clave?",
  "api-keys.form.expiration": "Vencimiento",
  "api-keys.form.namePlaceholder": "por ejemplo, Producción n8n",
  "api-keys.hide": "Ocultar",
  "api-keys.key": "Clave",
  "api-keys.key.hidden": "Oculta",
  "api-keys.lastUsed": "Último Uso",
  "api-keys.name": "Nombre",
  "api-keys.rateLimit": "Límite de Velocidad",
  "api-keys.rateLimit.perHour": "{{value}}/hora",
  "api-keys.rateLimit.requestsPerHour": "{{value}} solicitudes/hora",
  "api-keys.requests": "Solicitudes",
  "api-keys.revoke": "Revocar",
  "api-keys.show": "Mostrar",
  "api-keys.title": "Claves API",
  "api-keys.toast.clipboardUnavailable.description":
    "Su navegador no permite copiar al portapapeles de esta página. Copie la clave manualmente.",
  "api-keys.toast.clipboardUnavailable.title": "Portapapeles no disponible",
  "api-keys.toast.copied.description":
    "La clave API se ha copiado al portapapeles.",
  "api-keys.toast.copied.title": "Copiada",
  "api-keys.toast.copiedShort": "Clave API copiada.",
  "api-keys.toast.copyBlocked.description":
    "Por favor revela la clave primero.",
  "api-keys.toast.copyBlocked.title": "no se puede copiar",
  "api-keys.toast.copyFailed": "No se pudo copiar la clave API.",
  "api-keys.toast.createFailed.description":
    "Se produjo un error al crear la clave API.",
  "api-keys.toast.createFailed.title": "No se pudo crear la clave API",
  "api-keys.toast.loadFailed.description":
    "Se produjo un error al cargar las claves API.",
  "api-keys.toast.loadFailed.title": "No se pudieron cargar las claves API",
  "api-keys.toast.revealFailed.description":
    "Esta clave API no se puede volver a ver.",
  "api-keys.toast.revealFailed.title": "No se puede revelar la clave",
  "api-keys.toast.revoked.description":
    "The API key has been revoked successfully.",
  "api-keys.toast.revoked.title": "API Key Revoked",
  "api-keys.toast.revokeFailed.description":
    "No se pudo revocar la clave API. Por favor inténtalo de nuevo.",
  "api-keys.toast.validation.description":
    "Por favor revise el formulario: {{details}}",
  "api-keys.toast.validation.title": "Error de validación",
  "app.about.description":
    "RAGSuite ayuda a los equipos a implementar flujos de trabajo inteligentes de búsqueda, chat y análisis con una gobernanza sólida y una iteración rápida.",
  "app.about.productSubtitle":
    "IA conversacional y de recuperación soberana en su infraestructura.",
  "app.about.subtitle": "Información de producto y versión",
  "app.about.title": "Sobre nosotras",
  "app.about.version": "Versión v{{version}}",
  "app.licenses.sectionSubtitle":
    "Bibliotecas principales utilizadas en la aplicación móvil.",
  "app.licenses.sectionTitle": "Licencias de código abierto",
  "app.licenses.subtitle": "Avisos de código abierto",
  "app.licenses.title": "Licencias",
  "app.settings.appVersion": "Versión de la aplicación",
  "app.settings.legal": "Legal y aplicación",
  "app.settings.privacyPolicy": "política de privacidad",
  "app.settings.workspace": "Espacio de trabajo",
  "app.terms.body1":
    "Al utilizar RAGSuite, acepta utilizar la plataforma de manera responsable, seguir las leyes aplicables y mantener la confidencialidad de su cuenta.",
  "app.terms.body2":
    "Los equipos son responsables del contenido cargado en su espacio de trabajo, la gestión del acceso y el cumplimiento de los requisitos normativos e internos.",
  "app.terms.footer":
    "Para conocer los términos legales completos, comuníquese con support@ragsuite.ai.",
  "app.terms.sectionSubtitle":
    "Los términos que rigen el uso de los productos y servicios de RAGSuite.",
  "app.terms.sectionTitle": "Términos de servicio",
  "app.terms.subtitle": "Términos legales para usar la aplicación",
  "app.terms.title": "Términos de servicio",
  "audit.col.action": "Acción",
  "audit.col.actor": "Usuario/actor",
  "audit.col.eventType": "Tipo de evento",
  "audit.col.project": "Proyecto",
  "audit.col.resource": "Recurso",
  "audit.col.severity": "Gravedad",
  "audit.col.status": "Estado",
  "audit.col.timestamp": "Marca de tiempo",
  "audit.description":
    "Revise la seguridad y la actividad operativa de sus proyectos.",
  "audit.detail.changes": "Cambios",
  "audit.detail.device": "Dispositivo/agente de usuario",
  "audit.detail.failureReason": "Motivo del fracaso",
  "audit.detail.ip": "dirección IP",
  "audit.detail.raw": "Detalles completos",
  "audit.detail.title": "Detalles del evento",
  "audit.empty": "No se encontraron eventos de auditoría.",
  "audit.filter.account": "Cuenta",
  "audit.filter.activeProject": "Proyecto activo",
  "audit.filter.all": "Toda",
  "audit.filter.allProjects": "Todos los proyectos",
  "audit.filter.category": "Categoría",
  "audit.filter.project": "Proyecto",
  "audit.filter.severity": "Gravedad",
  "audit.filter.status": "Estado",
  "audit.loading": "Cargando…",
  "audit.loadMore": "Cargar más",
  "audit.scope.account":
    "Mostrar eventos a nivel de cuenta (inicio de sesión, contraseña, 2FA, sesiones), incluidos inicios de sesión fallidos para su nombre de usuario.",
  "audit.scope.activeProject":
    'Mostrando eventos del espacio de trabajo "{{name}}" más eventos de seguridad de su cuenta (inicio de sesión, contraseña, 2FA, sesiones).',
  "audit.scope.allProjects":
    "Mostrar eventos en todos los proyectos de su propiedad, incluidos los inicios de sesión fallidos con su nombre de usuario cuando no se encontró ninguna cuenta.",
  "audit.searchPlaceholder": "Buscar eventos…",
  "audit.title": "Registros de auditoría y cumplimiento",
  "auth.form.signUp.title": "Crea tu cuenta",
  "chatbot.colors.blue": "Azul",
  "chatbot.colors.darkGray": "Gris oscuro",
  "chatbot.colors.gradient": "Gradiente",
  "chatbot.colors.green": "Verde",
  "chatbot.colors.orange": "Naranja",
  "chatbot.colors.purple": "Morado",
  "chatbot.config.activeStatus.activeBadge": "Activo",
  "chatbot.config.activeStatus.activeDescription":
    "El chatbot está activo actualmente",
  "chatbot.config.activeStatus.description":
    "Habilita o deshabilita el servicio del chatbot",
  "chatbot.config.activeStatus.inactiveDescription":
    "El chatbot está inactivo actualmente",
  "chatbot.config.activeStatus.label": "Estado del chatbot",
  "chatbot.config.activeStatus.loading": "Cargando estado de activación...",
  "chatbot.config.activeStatus.title": "Estado activo",
  "chatbot.config.activeStatus.updating": "Actualizando estado...",
  "chatbot.config.bubbleMessageLabel": "Mensaje burbuja",
  "chatbot.config.bubbleMessagePlaceholder": "Mensaje burbuja",
  "chatbot.config.defaultBubbleMessage": "Mensaje burbuja",
  "chatbot.config.defaultTitle": "Demostración de RAGSuite",
  "chatbot.config.defaultWelcomeMessage": "Hola, ¿en qué puedo ayudarte?",
  "chatbot.config.description":
    "Configura los ajustes básicos y el comportamiento de tu chatbot",
  "chatbot.config.feedbackEnabled.description":
    "Si está desactivado, el chatbot oculta los pulgares, valoraciones y comentarios escritos y no guarda nuevos comentarios.",
  "chatbot.config.feedbackEnabled.label": "Recopilar comentarios de usuarios",
  "chatbot.config.languageLabel": "Idioma del chatbot",
  "chatbot.config.loading": "Cargando configuración...",
  "chatbot.config.save": "Guardar configuración",
  "chatbot.config.saving": "Guardando...",
  "chatbot.config.title": "Configuración",
  "chatbot.config.titleLabel": "Título del chatbot",
  "chatbot.config.titlePlaceholder": "Demostración de RAGSuite",
  "chatbot.config.unavailable":
    "La configuración del widget de chat no está disponible.",
  "chatbot.config.welcomeMessageLabel": "Mensaje de bienvenida",
  "chatbot.config.welcomeMessagePlaceholder": "Hola, ¿en qué puedo ayudarte?",
  "chatbot.description":
    "Configura y gestiona el entrenamiento, los ajustes y las integraciones de tu chatbot",
  "chatbot.domains.addButton": "Agregar",
  "chatbot.domains.addButton.a11y": "Agregar URL",
  "chatbot.domains.addUrl.a11y": "Agregar URL permitida",
  "chatbot.domains.addUrl.subtitle":
    "Ingrese un sitio web completo o la URL de una página. Eliminamos hashes, ignoramos los parámetros de consulta y normalizamos las barras diagonales.",
  "chatbot.domains.addUrl.title": "Agregar URL permitida",
  "chatbot.domains.allowedUrls.title": "URL permitidas",
  "chatbot.domains.description":
    "Configura qué dominios pueden usar tu widget de chatbot",
  "chatbot.domains.empty.description":
    "Las URL permitidas son obligatorias. Agregue al menos una entrada para habilitar los widgets.",
  "chatbot.domains.empty.label": "No hay lista de permitidos configurada",
  "chatbot.domains.empty.subtitle":
    "Aún no hay URL configuradas. Agregue al menos una entrada para que funcionen los widgets.",
  "chatbot.domains.entries": "{{count}} entradas",
  "chatbot.domains.entry": "Entrada {{count}}",
  "chatbot.domains.loading": "Cargando dominios...",
  "chatbot.domains.remove.a11y": "Quitar {{domain}}",
  "chatbot.domains.scope.a11y": "Alcance de la URL",
  "chatbot.domains.scope.entireSite": "Todo el sitio",
  "chatbot.domains.scope.pageAndSubpaths": "Página + subrutas",
  "chatbot.domains.scope.pageOnly": "Sólo esta página",
  "chatbot.domains.scopeLabel": "Alcance",
  "chatbot.domains.title": "Dominios permitidos",
  "chatbot.domains.validation.a11y": "Cómo funciona la validación de dominio",
  "chatbot.domains.validation.bullet1":
    "Las URL permitidas son obligatorias: los widgets solo funcionarán en las entradas configuradas.",
  "chatbot.domains.validation.bullet2":
    "Debe agregar al menos una URL para que funcionen los widgets.",
  "chatbot.domains.validation.bullet3":
    "Las URL están normalizadas (se elimina www, se conservan las rutas y se recortan las barras diagonales).",
  "chatbot.domains.validation.bullet4":
    "Los dominios no autorizados recibirán un error 403 Prohibido.",
  "chatbot.domains.validation.bullet5":
    "La validación de dominio se aplica tanto al chatbot como a los widgets de búsqueda.",
  "chatbot.domains.validation.bullet6":
    "Puede permitir un sitio completo o una sola página (con subrutas opcionales).",
  "chatbot.domains.validation.title": "Cómo funciona la validación de dominio:",
  "chatbot.embedding.reindex.button.idle": "Reindexar ahora",
  "chatbot.embedding.reindex.button.running": "Reindexando…",
  "chatbot.embedding.reindex.failed.title": "Reindexación fallida",
  "chatbot.embedding.reindex.lastRun.failed":
    "La última reindexación falló: {{detail}}",
  "chatbot.embedding.reindex.lastRun.incomplete":
    "La última reindexación finalizó pero {{missing}} elementos aún no están incrustados. Intentar otra vez.",
  "chatbot.embedding.reindex.partial.body":
    "{{embedded}}/{{total}} embebido(s); {{failed}} fallaron.",
  "chatbot.embedding.reindex.partial.title":
    "Reindexación finalizada con errores",
  "chatbot.embedding.reindex.progress": "Reindexando {{done}} / {{total}}",
  "chatbot.embedding.reindex.success.body":
    "{{embedded}}/{{total}} documento(s) embebido(s) con el modelo activo.",
  "chatbot.embedding.reindex.success.title": "Reindexación completa",
  "chatbot.embedding.status.a11y": "Incrustar estado de reindexación",
  "chatbot.embedding.status.allEmbedded.body":
    "{{count}} vectores almacenados para {{model}}.",
  "chatbot.embedding.status.allEmbedded.title":
    "Todos los documentos están embebidos con este modelo",
  "chatbot.embedding.status.coverageSummary":
    "{{embedded}} de {{total}} elementos incrustados.",
  "chatbot.embedding.status.empty.body":
    "Sube documentos o rastrea una fuente. Se embeberán con {{model}}.",
  "chatbot.embedding.status.empty.title": "Aún no hay documentos",
  "chatbot.embedding.status.error.title":
    "No se pudo cargar el estado de embeddings",
  "chatbot.embedding.status.fallbackWarning":
    "La configuración guardada no pudo usar su clave API; en su lugar, verificó el modelo predeterminado ({{model}}). Agregue una clave API válida y guárdela nuevamente.",
  "chatbot.embedding.status.loadFailed":
    "No se pudo cargar el estado de inserción",
  "chatbot.embedding.status.loading": "Comprobando embeddings…",
  "chatbot.embedding.status.needsReindex.body":
    "Tienes {{total}} documento(s) que aún no están embebidos con {{model}}. Reindexa para usarlos en el chat.",
  "chatbot.embedding.status.needsReindex.title":
    "Algunos documentos no están embebidos con este modelo",
  "chatbot.embedding.status.otherCollections":
    "{{count}} embedding(s) más de este proyecto aún tienen vectores antiguos.",
  "chatbot.embedding.status.refresh": "Actualizar",
  "chatbot.embedding.status.refreshA11y": "Actualizar el estado de inserción",
  "chatbot.feedback.unavailable":
    "La configuración de comentarios no está disponible.",
  "chatbot.history.citation.untitled": "Sin título",
  "chatbot.history.confirm.deleteAll.message":
    "Esto elimina permanentemente todo el historial de chat. Esto no se puede deshacer.",
  "chatbot.history.confirm.deleteAll.title":
    "¿Eliminar todas las conversaciones?",
  "chatbot.history.confirm.deleteOne.title": "¿Eliminar conversación?",
  "chatbot.history.confirm.deleteSelected.message":
    "¿Eliminar {{count}} conversación(es)? Esto no se puede deshacer.",
  "chatbot.history.confirm.deleteSelected.title":
    "¿Eliminar conversaciones seleccionadas?",
  "chatbot.history.conversationCount": "{{count}} conversación",
  "chatbot.history.conversationNotFound": "Conversación no encontrada",
  "chatbot.history.conversationNotFoundDescription":
    "Es posible que se haya eliminado o que aún se esté cargando.",
  "chatbot.history.conversationsCount": "{{count}} conversaciones",
  "chatbot.history.conversationTitle": "Conversación",
  "chatbot.history.copyFailed": "No se pudo copiar el mensaje.",
  "chatbot.history.copyMessageA11y": "Copiar mensaje",
  "chatbot.history.copySuccess": "Mensaje copiado.",
  "chatbot.history.deleteAll": "Eliminar todo",
  "chatbot.history.deleteAll.a11y": "Eliminar todo el historial de chat",
  "chatbot.history.deleteConversationA11y": "Eliminar conversación",
  "chatbot.history.deleteSelected": "Eliminar seleccionada ({{count}})",
  "chatbot.history.deleteSelected.a11y":
    "Eliminar conversaciones seleccionadas, {{count}}",
  "chatbot.history.description":
    "Ver y filtrar registros del historial de chat",
  "chatbot.history.empty": "No se encontraron conversaciones",
  "chatbot.history.filter.allTime": "Todo el tiempo",
  "chatbot.history.filter.last30Days": "Últimos 30 días",
  "chatbot.history.filter.last7Days": "Últimos 7 días",
  "chatbot.history.filter.lastYear": "Último año",
  "chatbot.history.filter.placeholder": "Filtrar por fecha",
  "chatbot.history.filter.today": "Hoy",
  "chatbot.history.filterEmpty.body":
    "Pruebe con una búsqueda o rango de tiempo diferente.",
  "chatbot.history.filterEmpty.title":
    "Ninguna conversación coincide con tus filtros.",
  "chatbot.history.filters": "Filtros",
  "chatbot.history.filtersActive": "Filtros, {{count}} activo",
  "chatbot.history.filtersHint": "Abre opciones de rango de tiempo",
  "chatbot.history.loading": "Cargando historial de chat...",
  "chatbot.history.mock.query1": "¿Qué es la IA?",
  "chatbot.history.mock.query2": "¿Cómo funciona el aprendizaje automático?",
  "chatbot.history.mock.query3": "Ayuda con la configuración",
  "chatbot.history.mock.response1":
    "La IA significa Inteligencia Artificial...",
  "chatbot.history.mock.response2":
    "El aprendizaje automático es un subconjunto de la IA...",
  "chatbot.history.mock.response3": "Puedo ayudarte a configurar...",
  "chatbot.history.mock.support": "Soporte",
  "chatbot.history.mock.technical": "Técnico",
  "chatbot.history.search.a11y": "Buscar conversaciones",
  "chatbot.history.search.placeholder": "Buscar conversaciones...",
  "chatbot.history.selectAll": "Seleccionar todo",
  "chatbot.history.selectAllVisible":
    "Seleccionar todas las conversaciones visibles",
  "chatbot.history.selectConversation":
    "Selecciona una conversación para ver los mensajes",
  "chatbot.history.selectedCount": "{{count}} seleccionado",
  "chatbot.history.sources": "Fuentes",
  "chatbot.history.timeRange.label": "Rango de tiempo",
  "chatbot.history.title": "Historial de chat",
  "chatbot.history.user": "Usuaria",
  "chatbot.history.viewSource": "Ver fuente →",
  "chatbot.history.viewSourceA11y": "Ver fuente {{title}}",
  "chatbot.integrations.copyFailed":
    "No se pudo copiar el fragmento. Por favor inténtalo de nuevo.",
  "chatbot.integrations.mobile.copy.description":
    "Código del SDK móvil copiado al portapapeles",
  "chatbot.integrations.mobile.copy.title": "Copiado",
  "chatbot.integrations.mobile.description":
    "Integra el SDK del chatbot en tu app móvil",
  "chatbot.integrations.mobile.instructions.configure":
    "Configure projectId, apiKey (rgs_live_…), endpoint y features",
  "chatbot.integrations.mobile.instructions.importInit":
    "Envuelva su app con SafeAreaProvider y RAGSuiteProvider",
  "chatbot.integrations.mobile.instructions.install":
    "Expo: npx expo install @ragsuite/react-native react-native-safe-area-context expo-blur expo-linear-gradient expo-clipboard | CLI: npm install @ragsuite/react-native react-native-safe-area-context @react-native-community/blur react-native-linear-gradient @react-native-clipboard/clipboard",
  "chatbot.integrations.mobile.instructions.start":
    "Renderice RAGSuiteChat dentro de RAGSuiteProvider",
  "chatbot.integrations.mobile.instructions.step1":
    "Instale el SDK mobile en su app Expo o móvil (consulte el comando de instalación abajo).",
  "chatbot.integrations.mobile.instructions.step2":
    "Importe SafeAreaProvider y RAGSuiteProvider desde @ragsuite/react-native.",
  "chatbot.integrations.mobile.instructions.step3":
    "Configure projectId, apiKey (rgs_live_… en Configuración → Claves API) y endpoint en RAGSuiteProvider.",
  "chatbot.integrations.mobile.instructions.step4":
    "Añada RAGSuiteChat dentro de RAGSuiteProvider con features={['chat']}.",
  "chatbot.integrations.mobile.instructions.step5":
    "Reconstruya la app y verifique en un dispositivo o simulador — no use el token de embed web en apps móviles.",
  "chatbot.integrations.mobile.instructions.title":
    "Instrucciones de instalación:",
  "chatbot.integrations.mobile.regenerate": "Regenerar",
  "chatbot.integrations.mobile.script.commentTitle":
    "Integración del SDK móvil",
  "chatbot.integrations.mobile.script.sampleApiKey": "TU_API_KEY",
  "chatbot.integrations.mobile.scriptLabel": "Código del SDK móvil",
  "chatbot.integrations.mobile.title": "Integración móvil",
  "chatbot.integrations.scripts.subtitle":
    "Copie fragmentos de inserción para clientes web y móviles.",
  "chatbot.integrations.snippetUnavailable":
    "Fragmento de integración no disponible.",
  "chatbot.integrations.tabA11y": "Integraciones de chatbots",
  "chatbot.integrations.web.copy.description":
    "Script web copiado al portapapeles",
  "chatbot.integrations.web.copy.title": "Copiado",
  "chatbot.integrations.web.description":
    "Incrusta el widget del chatbot en tu sitio web",
  "chatbot.integrations.web.instructions.appear":
    "El widget del chatbot aparecerá en tu página",
  "chatbot.integrations.web.instructions.copy": "Copia el script anterior",
  "chatbot.integrations.web.instructions.noteAfter": "el punto de acceso",
  "chatbot.integrations.web.instructions.noteBefore":
    "Asegúrate de que tu backend esté configurado para servir los archivos del widget en el endpoint",
  "chatbot.integrations.web.instructions.noteLabel": "Nota:",
  "chatbot.integrations.web.instructions.pasteAfter": "en tu HTML",
  "chatbot.integrations.web.instructions.pasteBefore":
    "Pégalo antes de la etiqueta de cierre",
  "chatbot.integrations.web.instructions.refresh":
    "Guarda y actualiza tu sitio web",
  "chatbot.integrations.web.instructions.replaceAfter":
    "por tu ID de proyecto real (se rellena automáticamente si tienes un proyecto activo)",
  "chatbot.integrations.web.instructions.replaceBefore": "Sustituye",
  "chatbot.integrations.web.instructions.title":
    "Instrucciones de instalación:",
  "chatbot.integrations.web.regenerate.button": "Regenerar",
  "chatbot.integrations.web.regenerate.description":
    "Se generó un nuevo script de inserción con la configuración actual",
  "chatbot.integrations.web.regenerate.title": "Script regenerado",
  "chatbot.integrations.web.script.commentAdvanced":
    "Alternativa: configuración avanzada",
  "chatbot.integrations.web.script.commentPlacement":
    "Añade este script antes de la etiqueta de cierre </body>",
  "chatbot.integrations.web.script.commentTitle":
    "Widget de chatbot de RAG Suite",
  "chatbot.integrations.web.script.sampleTitle": "Asistente de IA",
  "chatbot.integrations.web.script.sampleWelcome":
    "Hola. ¿En qué puedo ayudarle?",
  "chatbot.integrations.web.scriptLabel": "Script del widget web",
  "chatbot.integrations.web.title": "Integración web",
  "chatbot.languages.ar": "Árabe",
  "chatbot.languages.de": "Alemán",
  "chatbot.languages.en": "Inglés (EE. UU.)",
  "chatbot.languages.enGb": "Inglés (Reino Unido)",
  "chatbot.languages.es": "Español",
  "chatbot.languages.fr": "Francés",
  "chatbot.languages.hi": "hindi",
  "chatbot.languages.pt": "Portugués (Brasil)",
  "chatbot.languages.zh": "Chino (simplificado)",
  "chatbot.models.apiKey.helper": "Clave API para el proveedor seleccionado",
  "chatbot.models.apiKey.label": "Clave API",
  "chatbot.models.apiKey.ollamaHelper":
    "La clave API se establece automáticamente para el proveedor Ollama",
  "chatbot.models.apiKey.ollamaPlaceholder": "Autorrelleno para Ollama",
  "chatbot.models.apiKey.placeholder": "Introduce la clave API",
  "chatbot.models.apiKey.savedPlaceholder":
    "Ingrese la nueva clave para reemplazar",
  "chatbot.models.chatModel.helper":
    "El modelo usado para tareas de chat/completado",
  "chatbot.models.chatModel.label": "Modelo de chat",
  "chatbot.models.chatModel.noneAvailable": "No hay modelos disponibles",
  "chatbot.models.chatModel.placeholder": "Seleccionar modelo",
  "chatbot.models.chatModel.selectProvider": "Selecciona primero un proveedor",
  "chatbot.models.description":
    "Configura el proveedor de modelos de IA y la selección de modelos",
  "chatbot.models.embeddingModel.helper":
    "El modelo usado para embeddings (opcional)",
  "chatbot.models.embeddingModel.helperFallback":
    "Sin modelo seleccionado — se usará Jina (predeterminado).",
  "chatbot.models.embeddingModel.label": "Modelo de embeddings",
  "chatbot.models.embeddingModel.none": "Ninguno (opcional)",
  "chatbot.models.embeddingModel.noneAvailable":
    "No hay modelos de embeddings disponibles para este proveedor",
  "chatbot.models.embeddingModel.placeholder":
    "Selecciona un modelo de embeddings (opcional)",
  "chatbot.models.embeddingModel.selectProvider":
    "Selecciona primero un proveedor",
  "chatbot.models.loading": "Cargando ajustes del modelo...",
  "chatbot.models.parameters.bestOf": "La mejor de",
  "chatbot.models.parameters.frequencyPenalty": "Penalización de frecuencia",
  "chatbot.models.parameters.frequencyPenaltyHint":
    "(chatgpt.openai_frequency_penalty [cadena])",
  "chatbot.models.parameters.frequencyPenaltyPlaceholder": "0,01",
  "chatbot.models.parameters.presencePenalty": "Penalización de presencia",
  "chatbot.models.parameters.presencePenaltyHint":
    "(chatgpt.openai_presence_penalty [cadena])",
  "chatbot.models.parameters.presencePenaltyPlaceholder": "0,01",
  "chatbot.models.parameters.temperature": "Temperatura",
  "chatbot.models.parameters.temperatureHint":
    "(chatgpt.openai_temperature [string])",
  "chatbot.models.parameters.temperaturePlaceholder": "0,7",
  "chatbot.models.parameters.topP": "P superior",
  "chatbot.models.parameters.topPHint": "(chatgpt.openai_top_p [cadena])",
  "chatbot.models.parameters.topPPlaceholder": "0,01",
  "chatbot.models.provider.label": "Proveedor del modelo",
  "chatbot.models.provider.loading": "Cargando proveedores...",
  "chatbot.models.provider.placeholder": "Seleccionar proveedor",
  "chatbot.models.rag.maxTokens": "Máx. tokens",
  "chatbot.models.rag.maxTokensHelper":
    "Longitud máxima de las respuestas generadas (mínimo: 50, máximo: 3000)",
  "chatbot.models.rag.similarityThreshold": "Umbral de similitud",
  "chatbot.models.rag.similarityThresholdHelper":
    "Puntuación mínima de similitud para incluir documentos",
  "chatbot.models.rag.topK": "Mejores resultados K",
  "chatbot.models.rag.topKHelper":
    "Número de fragmentos recuperados de la base de datos de vectores por consulta",
  "chatbot.models.rag.useReranker": "Usar reordenador",
  "chatbot.models.rag.useRerankerHelper":
    "Mejorar la relevancia con reordenamiento",
  "chatbot.models.save": "Guardar configuración del modelo",
  "chatbot.models.title": "Ajustes del modelo",
  "chatbot.models.unavailable":
    "La configuración del modelo no está disponible.",
  "chatbot.primaryTab.a11y": "Pestaña {{label}}",
  "chatbot.prompt.default":
    "Eres una asistente de inteligencia artificial útil ...",
  "chatbot.prompt.defaultBadge":
    "Predeterminado: haga clic en Guardar para aplicar un mensaje personalizado",
  "chatbot.prompt.description":
    "Personaliza el prompt del sistema para tu chatbot",
  "chatbot.prompt.helper":
    "Este prompt define el comportamiento y la personalidad del chatbot",
  "chatbot.prompt.label": "Prompt del sistema",
  "chatbot.prompt.loading": "Cargando prompt...",
  "chatbot.prompt.placeholder": "Introduce tu prompt del sistema...",
  "chatbot.prompt.save": "Guardar prompt",
  "chatbot.prompt.saving": "Guardando...",
  "chatbot.prompt.title": "Edición del prompt",
  "chatbot.prompt.unsavedBadge": "Cambios no guardados",
  "chatbot.screen.subtitle":
    "Entrene su índice y configure el widget del chatbot empresarial.",
  "chatbot.settings.configShort": "configuración",
  "chatbot.settings.configuration": "Configuración",
  "chatbot.settings.customisation": "Personalización",
  "chatbot.settings.customShort": "Personal.",
  "chatbot.settings.domains": "Dominios permitidos",
  "chatbot.settings.domainsShort": "Dominios",
  "chatbot.settings.feedback": "Comentario",
  "chatbot.settings.feedbackShort": "Comentario",
  "chatbot.settings.models": "Ajustes del modelo",
  "chatbot.settings.modelsShort": "Modelos",
  "chatbot.settings.overview": "Resumen",
  "chatbot.settings.preview.allowedDomains": "Dominios permitidos",
  "chatbot.settings.preview.allowedUrls": "URLs permitidas:",
  "chatbot.settings.preview.allowlistLabel": "Lista de permitidos:",
  "chatbot.settings.preview.apiKeyLabel": "Clave API:",
  "chatbot.settings.preview.avatarSizeLabel": "Tamaño del avatar:",
  "chatbot.settings.preview.chatbotConfig": "Config. del chatbot",
  "chatbot.settings.preview.chatModel": "Charla: {{model}}",
  "chatbot.settings.preview.configuredCount": "{{count}} configurados",
  "chatbot.settings.preview.description":
    "Vista previa en tiempo real de todas las configuraciones",
  "chatbot.settings.preview.disabled": "Desactivada",
  "chatbot.settings.preview.embeddingModel": "Incrustación: {{model}}",
  "chatbot.settings.preview.enabled": "Activada",
  "chatbot.settings.preview.languageLabel": "Idioma:",
  "chatbot.settings.preview.models": "Modelos",
  "chatbot.settings.preview.moreCount": "+{{count}} más",
  "chatbot.settings.preview.noDomains": "No hay dominios configurados",
  "chatbot.settings.preview.positionLabel": "Posición:",
  "chatbot.settings.preview.showDateTimeLabel": "Mostrar fecha/hora:",
  "chatbot.settings.preview.showLogoLabel": "Mostrar logo:",
  "chatbot.settings.preview.title": "Vista previa de configuración de ajustes",
  "chatbot.settings.preview.titleLabel": "Título:",
  "chatbot.settings.preview.unavailable":
    "La descripción general de la configuración no está disponible.",
  "chatbot.settings.preview.widget": "widget",
  "chatbot.settings.subtitle":
    "Configure el modelo, el widget, los dominios y las integraciones.",
  "chatbot.settings.title": "Ajustes",
  "chatbot.tabs.integrations": "Integraciones",
  "chatbot.tabs.integrationsCompact": "Integraciones",
  "chatbot.tabs.settings": "Ajustes",
  "chatbot.tabs.training": "Entrenamiento",
  "chatbot.time.daysAgo": "hace {{count}} días",
  "chatbot.time.hoursAgo": "hace {{count}} horas",
  "chatbot.time.justNow": "justo ahora",
  "chatbot.time.minutesAgo": "hace {{count}} min",
  "chatbot.time.monthsAgo": "hace {{count}} meses",
  "chatbot.time.unknown": "Desconocido",
  "chatbot.time.yearsAgo": "hace {{count}} años",
  "chatbot.title": "Configuración del chatbot",
  "chatbot.toast.avatarUploaded.description":
    "El avatar personalizado se guardará cuando hagas clic en Guardar.",
  "chatbot.toast.avatarUploaded.title": "Avatar personalizado cargado",
  "chatbot.toast.deleteAll.description":
    "{{count}} conversación(es) eliminadas correctamente.",
  "chatbot.toast.deleteAll.title": "Eliminado",
  "chatbot.toast.deleteAllError.description":
    "No se pudieron eliminar algunas conversaciones. Inténtalo de nuevo.",
  "chatbot.toast.deleteConversation.description":
    "Conversación eliminada correctamente.",
  "chatbot.toast.deleteConversation.title": "Eliminado",
  "chatbot.toast.deleteConversationError.description":
    "No se pudo eliminar la conversación. Inténtalo de nuevo.",
  "chatbot.toast.loadHistoryError.description":
    "No se pudo cargar el historial de chat. Inténtalo de nuevo.",
  "chatbot.toast.logoUploaded.description":
    "El logotipo del widget se guardará cuando hagas clic en Guardar.",
  "chatbot.toast.logoUploaded.title": "Logotipo del widget cargado",
  "chatbot.toast.settingsSaved.description":
    "La configuración del chatbot se ha guardado correctamente.",
  "chatbot.toast.settingsSaved.title": "Ajustes guardados",
  "chatbot.training.activeConfig": "Configuración activa",
  "chatbot.training.activeConfig.subtitle":
    "Controle si el chatbot está activo y edite el mensaje del sistema.",
  "chatbot.training.activeConfig.unavailable":
    "Sin configuración de entrenamiento activo.",
  "chatbot.training.activeStatus.active": "Activo",
  "chatbot.training.activeStatus.disabled": "Deshabilitado",
  "chatbot.training.activeStatus.enabled": "Habilitado",
  "chatbot.training.activeStatus.inactive": "Inactivo",
  "chatbot.training.activeStatus.live": "El chatbot está en línea",
  "chatbot.training.activeStatus.offline": "El chatbot está desconectado",
  "chatbot.training.activeStatus.statusLabel": "Estado:",
  "chatbot.training.activeStatus.statusLine": "Estado: Chatbot es {{status}}",
  "chatbot.training.activeStatus.title": "Estado activo",
  "chatbot.training.activeStatus.updating": "Actualizando...",
  "chatbot.training.chatHistory": "Historial de chat",
  "chatbot.training.chatHistory.conversations": "{{count}} conversaciones",
  "chatbot.training.chatHistory.filtered": "Filtrado: {{filter}}",
  "chatbot.training.chatHistory.title": "Historial de chat",
  "chatbot.training.chatHistory.total": "{{count}} en total",
  "chatbot.training.chatHistory.totalMessages": "Mensajes totales:",
  "chatbot.training.configShort": "configuración",
  "chatbot.training.historyShort": "Historial",
  "chatbot.training.overview": "Resumen",
  "chatbot.training.overview.unavailable":
    "No hay descripción general de la capacitación disponible.",
  "chatbot.training.preview.description":
    "Vista previa en tiempo real de todas las configuraciones de entrenamiento",
  "chatbot.training.preview.title":
    "Vista previa de configuración de entrenamiento",
  "chatbot.training.prompt.chars": "{{count}} caracteres",
  "chatbot.training.prompt.empty": "No hay prompt configurado",
  "chatbot.training.prompt.emptyConfigured":
    "Aún no se ha configurado ningún mensaje del sistema.",
  "chatbot.training.prompt.length": "Longitud:",
  "chatbot.training.prompt.loading": "Cargando prompt...",
  "chatbot.training.prompt.title": "Prompt del sistema",
  "chatbot.training.prompt.words": "Palabras:",
  "chatbot.training.subtitle":
    "Supervise la indexación, la configuración activa y el historial de chat.",
  "chatbot.training.title": "Entrenamiento",
  "chatbot.widget.app.avatar.a11y": "avatar de chat",
  "chatbot.widget.app.clearConversation.a11y": "Conversación clara",
  "chatbot.widget.app.closeChat.a11y": "Cerrar chat",
  "chatbot.widget.app.disclaimer": "La IA generativa es experimental.",
  "chatbot.widget.app.messageInput.a11y": "mensaje de chat",
  "chatbot.widget.app.messagePlaceholder": "Mensaje...",
  "chatbot.widget.app.sendMessage.a11y": "enviar mensaje",
  "chatbot.widget.app.sources.fallbackTitle": "Fuente {{index}}",
  "chatbot.widget.app.sources.noSnippet": "No hay fragmento disponible",
  "chatbot.widget.app.sources.showAll": "Mostrar todas las fuentes {{count}}",
  "chatbot.widget.app.sources.showLess": "Mostrar menos",
  "chatbot.widget.app.sources.toggle": "Fuentes ({{count}})",
  "chatbot.widget.app.thumbsDown.a11y": "Pulgares abajo",
  "chatbot.widget.app.thumbsUp.a11y": "Pulgares hacia arriba",
  "chatbot.widget.avatar.customAlt": "Avatar personalizado",
  "chatbot.widget.avatar.customTitle": "Avatar personalizado",
  "chatbot.widget.avatar.empty": "No hay avatares disponibles",
  "chatbot.widget.avatar.removeCustom": "Eliminar avatar personalizado",
  "chatbot.widget.avatar.subtitle":
    "Elige un avatar preestablecido o sube tu propia imagen.",
  "chatbot.widget.colour.angle": "Ángulo",
  "chatbot.widget.colour.applyGradient": "Aplicar gradiente",
  "chatbot.widget.colour.customGradient": "Gradiente personalizado",
  "chatbot.widget.colour.gradientColour1": "Color de gradiente 1",
  "chatbot.widget.colour.gradientColour2": "Color de gradiente 2",
  "chatbot.widget.colour.pickCustom": "Elegir color personalizado",
  "chatbot.widget.colour.subtitle":
    "Controle los colores, el degradado y el ángulo de la marca.",
  "chatbot.widget.colour.title": "Color del chatbot",
  "chatbot.widget.customisation.subtitle":
    "Administre la marca, los colores, las opciones y el diseño de los widgets.",
  "chatbot.widget.customisation.unavailable": "Personalización no disponible.",
  "chatbot.widget.feedback.cancel.a11y": "Cancelar comentarios",
  "chatbot.widget.feedback.characters": "{{current}}/{{max}} caracteres",
  "chatbot.widget.feedback.close.a11y": "Cerrar formulario de comentarios",
  "chatbot.widget.feedback.comments.a11y":
    "Comentarios de retroalimentación adicionales",
  "chatbot.widget.feedback.commentsOptional":
    "Comentarios adicionales (opcional)",
  "chatbot.widget.feedback.commentsPlaceholder":
    "Cuéntanos más sobre tu experiencia con esta respuesta...",
  "chatbot.widget.feedback.dismiss.a11y": "Descartar comentarios",
  "chatbot.widget.feedback.negative": "Comentarios negativos",
  "chatbot.widget.feedback.negativeEmoji": "👎 Comentarios negativos",
  "chatbot.widget.feedback.positive": "Comentarios positivos",
  "chatbot.widget.feedback.positiveEmoji": "👍 Comentarios positivos",
  "chatbot.widget.feedback.rate.a11y": "Califica {{value}} sobre 5",
  "chatbot.widget.feedback.rating": "Clasificación",
  "chatbot.widget.feedback.reason.accurate": "Precisa",
  "chatbot.widget.feedback.reason.clear": "Clara",
  "chatbot.widget.feedback.reason.complete": "Completa",
  "chatbot.widget.feedback.reason.fast_response": "Respuesta rápida",
  "chatbot.widget.feedback.reason.hallucinated": "Alucinada",
  "chatbot.widget.feedback.reason.helpful": "Útil",
  "chatbot.widget.feedback.reason.incorrect": "Incorrecta",
  "chatbot.widget.feedback.reason.low_quality": "Baja calidad",
  "chatbot.widget.feedback.reason.missing_sources": "Fuentes faltantes",
  "chatbot.widget.feedback.reason.outdated_information":
    "Información desactualizada",
  "chatbot.widget.feedback.reason.poor_formatting": "Mal formato",
  "chatbot.widget.feedback.reason.slow_response": "Respuesta lenta",
  "chatbot.widget.feedback.reason.too_technical": "Demasiado técnica",
  "chatbot.widget.feedback.reasonsOptional": "Razones (opcional)",
  "chatbot.widget.feedback.submit": "Enviar comentarios",
  "chatbot.widget.feedback.submit.a11y": "Enviar comentarios",
  "chatbot.widget.feedback.submitCompact": "Entregar",
  "chatbot.widget.logo.chooseFile": "Elegir archivo",
  "chatbot.widget.logo.noFile": "Ningún archivo seleccionado",
  "chatbot.widget.logo.noFileSelected": "Ningún archivo seleccionado",
  "chatbot.widget.logo.preview": "Vista previa:",
  "chatbot.widget.logo.previewAlt": "Vista previa del logo del widget",
  "chatbot.widget.logo.subtitle":
    "Cargue y obtenga una vista previa del logotipo de su marca de widget.",
  "chatbot.widget.logo.title": "Subir logo",
  "chatbot.widget.options.showDateTime": "Mostrar fecha y hora",
  "chatbot.widget.options.showLogo": "Mostrar logo",
  "chatbot.widget.options.title": "Opciones",
  "chatbot.widget.position.left": "Izquierda",
  "chatbot.widget.position.right": "Derecha",
  "chatbot.widget.position.title": "Posición del chatbot",
  "chatbot.widget.preview.a11y": "Vista previa en vivo del widget de chat",
  "chatbot.widget.preview.close": "Cerca",
  "chatbot.widget.preview.onSiteWidth": "En su sitio: {{count}}px",
  "chatbot.widget.preview.open": "Abierta",
  "chatbot.widget.preview.scaled": "vista previa escalada para ajustarse",
  "chatbot.widget.preview.subtitleInteractive":
    "Vista previa de Chrome del widget interactivo",
  "chatbot.widget.preview.subtitleScaled":
    "Escalado para ajustarse a la vista previa (widget {{count}}px)",
  "chatbot.widget.preview.title": "Vista previa en vivo",
  "chatbot.widget.save.label": "Guardar personalización del widget",
  "chatbot.widget.save.saving": "Guardando...",
  "chatbot.widget.settings.avatarSize": "Tamaño del avatar: {{count}}px",
  "chatbot.widget.settings.bottomSpace":
    "Espacio inferior del widget: {{count}}px",
  "chatbot.widget.settings.customWidth": "Ancho personalizado",
  "chatbot.widget.settings.title": "Ajustes del widget",
  "chatbot.widget.settings.width": "Ancho: {{count}}px",
  "chatbot.widget.theme.backgroundLabel": "Fondo",
  "chatbot.widget.theme.textColorLabel": "Color del texto",
  "chatbot.widget.theme.title": "Tema del área de chat",
  "commandPalette.groups.actions": "Acciones",
  "common.a11y.backToAuditLogs": "Volver a registros de auditoría",
  "common.a11y.backToChatbotConfig": "Volver a la configuración del chatbot",
  "common.a11y.backToChatHistory": "Volver al historial de chat",
  "common.a11y.backToFeedback": "Volver a comentarios",
  "common.a11y.backToSearchConfig": "Volver a la configuración de búsqueda",
  "common.a11y.backToSearchHistory": "Volver al historial de búsqueda",
  "common.a11y.backToSettings": "Volver a configuración",
  "common.a11y.closeDialog": "Cerrar diálogo",
  "common.a11y.dismissDialog": "Cerrar cuadro de diálogo",
  "common.a11y.dismissMenu": "Cerrar menú",
  "common.a11y.goBack": "Volver",
  "common.a11y.hint.backToAuditLogs":
    "Vuelve a la lista de registros de auditoría.",
  "common.a11y.hint.backToChatbotConfig":
    "Abre la pestaña principal de Configuración de Chatbot.",
  "common.a11y.hint.backToChatHistory":
    "Regresa a la lista del historial de chat.",
  "common.a11y.hint.backToFeedback": "Regresa a la lista de comentarios.",
  "common.a11y.hint.backToSearchConfig":
    "Abre la pestaña principal de Configuración de búsqueda.",
  "common.a11y.hint.backToSearchHistory":
    "Regresa a la lista del historial de búsqueda.",
  "common.a11y.hint.backToSettings":
    "Abre la pestaña principal de Configuración.",
  "common.a11y.hint.goBack": "Vuelve a la pantalla anterior.",
  "common.a11y.loadingChatbotConfig": "Cargando configuración del chatbot",
  "common.a11y.loadingChatHistory": "Cargando historial de chat",
  "common.a11y.loadingConversations": "Cargando conversaciones",
  "common.a11y.openMenu": "abrir menú",
  "common.actions": "Comportamiento",
  "common.back": "Atrás",
  "common.cancel": "Cancelar",
  "common.clear": "Limpiar",
  "common.close": "Cerrar",
  "common.color.apply": "aplicar color",
  "common.color.channelG": "GRAMO",
  "common.color.hex": "Maleficio",
  "common.color.hexValue": "Valor de color hexadecimal",
  "common.color.hue": "Matiz",
  "common.color.openPicker": "Abrir selector de color",
  "common.color.pick": "Elige color",
  "common.color.pickerSubtitle":
    "Arrastra el panel de color o el control deslizante de tono para ajustarlo.",
  "common.color.preset": "Color preestablecido {{color}}",
  "common.color.presets": "Preajustes",
  "common.color.saturationBrightness": "Saturación y brillo",
  "common.color.selected": "Color seleccionado {{color}}",
  "common.copy": "Copiar",
  "common.copyFailed": "No se pudo copiar. Por favor inténtalo de nuevo.",
  "common.copySnippet": "Copiar fragmento",
  "common.create": "Crear",
  "common.delete": "Eliminar",
  "common.disabled": "Deshabilitado",
  "common.discard": "Desechar",
  "common.disconnect": "Desconectar",
  "common.done": "Hecho",
  "common.edit": "Editar",
  "common.enabled": "Habilitado",
  "common.filter": "Filtrar",
  "common.loading": "Cargando...",
  "common.mobile": "Móvil",
  "common.never": "Nunca",
  "common.next": "Siguiente",
  "common.notSet": "No establecido",
  "common.off": "INACTIVO",
  "common.on": "ACTIVO",
  "common.premiumWorkspace": "Plataforma de IA empresarial",
  "common.previous": "Anterior",
  "common.refresh": "Actualizar",
  "common.reset": "Reiniciar",
  "common.retry": "Reintentar",
  "common.save": "Guardar",
  "common.saveChanges": "Guardar cambios",
  "common.saveFailed":
    "No se pudieron guardar los cambios. Por favor inténtalo de nuevo.",
  "common.saveInProgress": "Guardar ya en progreso. Espere por favor.",
  "common.saving": "Guardando...",
  "common.search": "Buscar",
  "common.selectLanguage": "Seleccionar idioma",
  "common.snippetCopied": "Fragmento copiado",
  "common.success": "Éxito",
  "common.swipeToReadSnippet": "Desliza para leer el fragmento completo",
  "common.uploading": "Subiendo…",
  "common.yes": "Sí",
  "compareModels.confirm.deleteConfig.message":
    "¿Eliminar la configuración guardada de {{provider}} / {{model}}?",
  "compareModels.confirm.deleteConfig.title":
    "Eliminar configuración del modelo",
  "compareModels.description":
    "Ejecute una consulta en todos los modelos guardados y compare las respuestas una al lado de la otra.",
  "compareModels.empty.auto": "No hay modelos disponibles para comparar.",
  "compareModels.empty.both":
    "Configura modelos de chat y búsqueda para comparar.",
  "compareModels.empty.chat": "Configura modelos de chat para comparar.",
  "compareModels.empty.noProject":
    "Seleccione un proyecto para comparar modelos.",
  "compareModels.empty.search": "Configurar modelos de búsqueda para comparar.",
  "compareModels.error.generic": "La comparación de modelos falló.",
  "compareModels.errors.deleteConfigFailed":
    "Error al eliminar la configuración del modelo.",
  "compareModels.errors.loadConfigsFailed":
    "Error al cargar configuraciones de modelo.",
  "compareModels.errors.updateConfigFailed":
    "Error al actualizar la configuración del modelo.",
  "compareModels.progress.running":
    "Ejecutando consulta en modelos {{count}}...",
  "compareModels.query.placeholder":
    "Haga una pregunta para comparar modelos...",
  "compareModels.query.submit": "Comparar",
  "compareModels.result.completionTokens": "Terminación",
  "compareModels.result.promptTokens": "Inmediata",
  "compareModels.result.score": "Puntaje",
  "compareModels.results.empty":
    "No hay resultados para los modelos habilitados.",
  "compareModels.results.listA11y": "Resultados de la comparación de modelos",
  "compareModels.savedConfigs.close": "Cerca",
  "compareModels.savedConfigs.deleteA11y": "Eliminar {{model}}",
  "compareModels.savedConfigs.excluded": "Excluido de comparar",
  "compareModels.savedConfigs.included": "Incluido en comparar",
  "compareModels.savedConfigs.manage": "Administrar modelos guardadas",
  "compareModels.savedConfigs.title": "Configuraciones de modelos guardadas",
  "compareModels.savedConfigs.toggleA11y": "Alternar {{model}} comparar",
  "compareModels.status.resultsFor":
    "Resultados para: {{query}} — {{count}} modelo listo",
  "compareModels.status.resultsForPlural":
    "Resultados para: {{query}} — {{count}} modelos listos",
  "compareModels.title": "Comparar modelos",
  "configuration.description":
    "Administre claves API e integraciones externas para su proyecto.",
  "configuration.n8n.copyCurl": "Copiar cURL (Importar en n8n)",
  "configuration.n8n.description":
    "Conecte los flujos de trabajo n8n a Ragsuite para que sus automatizaciones puedan buscar sus documentos.",
  "configuration.n8n.inboundHelp":
    "Utilice estos valores en su nodo de solicitud HTTP n8n. Seleccione o pegue su clave API de Ragsuite para crear un comando cURL listo para importar.",
  "configuration.n8n.loadingTemplate": "Cargando plantilla entrante…",
  "configuration.n8n.pasteKeyLabel":
    "O pegue la clave API de Ragsuite (token de portador)",
  "configuration.n8n.refreshKeys": "Actualizar claves",
  "configuration.n8n.selectSavedKey": "Seleccione una clave API guardada",
  "configuration.n8n.testing": "Pruebas…",
  "configuration.n8n.testRetrieval": "Recuperación de prueba (Ragsuite)",
  "configuration.tabs.apiKeys": "Claves API",
  "configuration.title": "Configuración",
  "confluence.refresh": "Actualizar",
  "crawl.action.deleteDocument": "Eliminar documento",
  "crawl.action.documentActions": "Acciones de documentos",
  "crawl.action.editDocument": "Editar documento",
  "crawl.action.inspectDocument": "inspeccionar documento",
  "crawl.action.sourceActions": "Acciones fuente",
  "crawl.action.viewDocument": "Ver documento",
  "crawl.addSource": "Agregar Fuente",
  "crawl.alert.crawlLimitReached.description":
    "Hasta {{count}} rastreos se ejecutan en paralelo. Los rastreos adicionales se ponen en cola automáticamente y comienzan cuando se abre un espacio.",
  "crawl.alert.crawlLimitReached.title": "{{count}} gatea corriendo",
  "crawl.confirm.deleteDocument.message":
    '¿Eliminar "{{name}}" de la biblioteca?',
  "crawl.confirm.deleteDocument.messageFallback": "¿Eliminar este documento?",
  "crawl.confirm.deleteDocument.title": "Eliminar documento",
  "crawl.confirm.deleteDocuments.messageMany":
    "¿Eliminar {{count}} documentos seleccionados de la biblioteca?",
  "crawl.confirm.deleteDocuments.messageOne":
    "¿Eliminar el documento seleccionado de la biblioteca?",
  "crawl.confirm.deleteDocuments.title": "Eliminar documentos",
  "crawl.confirm.deleteSource.message":
    "¿Eliminar '{{name}}' y sus trabajos de rastreo?",
  "crawl.confirm.deleteSource.messageFallback": "¿Eliminar esta fuente?",
  "crawl.confirm.deleteSource.title": "Eliminar fuente",
  "crawl.description": "Configura y monitorea fuentes de rastreo de sitios web",
  "crawl.domain.addSource": "Añadir fuente",
  "crawl.domain.description": "Gestiona fuentes de rastreo y trabajos",
  "crawl.domain.search.placeholder": "Buscar fuentes...",
  "crawl.domain.tabs.jobs": "Trabajos",
  "crawl.domain.tabs.sources": "Fuentes",
  "crawl.error.loadFailed":
    "No se pueden cargar datos de rastreo. Por favor inténtalo de nuevo.",
  "crawl.filters.cadence": "Frecuencia",
  "crawl.filters.cadenceAll": "Todas las frecuencias",
  "crawl.filters.cadenceDaily": "Diario",
  "crawl.filters.cadenceOnce": "Una vez",
  "crawl.filters.cadenceWeekly": "Semanal",
  "crawl.filters.clear": "Limpiar filtros",
  "crawl.filters.status": "Estado",
  "crawl.filters.statusActive": "Activo",
  "crawl.filters.statusAll": "Todos los estados",
  "crawl.filters.statusInactive": "Inactivo",
  "crawl.filters.statusPending": "Pendiente",
  "crawl.form.depth.label": "Profundidad de rastreo",
  "crawl.form.frequency.label": "Frecuencia de rastreo",
  "crawl.form.headless.helper": "Habilitar para sitios con mucho JavaScript",
  "crawl.form.headless.label": "Modo de navegador sin cabeza",
  "crawl.form.url.label": "URL del sitio web",
  "crawl.jobs": "Trabajos",
  "crawl.jobs.detail.closeA11y": "Cerrar detalles del trabajo",
  "crawl.jobs.detail.crawledUrls": "URL rastreadas",
  "crawl.jobs.detail.embeddingCoverageWarning":
    "Algunos modelos de inserción activos no están indexados para esta fuente de rastreo.",
  "crawl.jobs.detail.failedUrls": "URL fallidas",
  "crawl.jobs.detail.noCrawledUrls": "No se rastreó ninguna URL.",
  "crawl.jobs.detail.noFailedUrls": "Ninguna URL falló.",
  "crawl.jobs.detail.noSkippedUrls": "No se omitió ninguna URL.",
  "crawl.jobs.detail.skippedUrls": "URL omitidas",
  "crawl.jobs.detail.stat.crawled": "Gateada",
  "crawl.jobs.detail.stat.failed": "Fallida",
  "crawl.jobs.detail.stat.skipped": "Saltada",
  "crawl.jobs.referrersMore": "+{{count}} más",
  "crawl.jobs.search.placeholder": "Buscar trabajos...",
  "crawl.jobs.status.completed": "Completado",
  "crawl.jobs.status.failed": "Fallido",
  "crawl.jobs.status.pending": "Pendiente",
  "crawl.jobs.status.running": "En ejecución",
  "crawl.jobs.status.waiting": "En espera",
  "crawl.search.filterHint":
    "Filtra la lista a continuación a medida que escribes",
  "crawl.source.form.addPattern": "Agregar",
  "crawl.source.form.allowEmptyCrawl": "Permitir rastreo vacío",
  "crawl.source.form.allowEmptyCrawlHelper":
    "Deje que los trabajos de rastreo finalicen correctamente cuando no se descubra ninguna página.",
  "crawl.source.form.allowlist": "Patrones de lista permitida",
  "crawl.source.form.allowlistHelper":
    "Patrones de URL a incluir (use * para comodines)",
  "crawl.source.form.cadence": "Cadencia",
  "crawl.source.form.createSource": "Crear fuente",
  "crawl.source.form.createSourceA11y": "Crear fuente",
  "crawl.source.form.denylist": "Patrones de lista de denegados",
  "crawl.source.form.denylistHelper": "Patrones de URL para excluir",
  "crawl.source.form.denylistPlaceholder": "/admin/* o /privado/*",
  "crawl.source.form.depth": "Profundidad de rastreo",
  "crawl.source.form.description": "Descripción",
  "crawl.source.form.descriptionA11y": "Descripción de la fuente",
  "crawl.source.form.descriptionOptional": "Descripción (opcional)",
  "crawl.source.form.descriptionPlaceholder":
    "Descripción opcional para esta fuente",
  "crawl.source.form.headless": "Modo sin cabeza",
  "crawl.source.form.headlessOff": "Apagada",
  "crawl.source.form.headlessOn": "En",
  "crawl.source.form.name": "Nombre de fuente",
  "crawl.source.form.namePlaceholder": "por ejemplo, sitio de documentación",
  "crawl.source.form.patternPlaceholder": "por ejemplo, /docs/*",
  "crawl.source.form.previewFailed":
    "No se pudo obtener una vista previa de la URL. Verifique la dirección e inténtelo nuevamente.",
  "crawl.source.form.previewing": "Vista previa…",
  "crawl.source.form.previewUrl": "URL de vista previa",
  "crawl.source.form.reachable": "Accesible",
  "crawl.source.form.skipHeaderFooter": "Saltar encabezado y pie de página",
  "crawl.source.form.skipHeaderFooterHelper":
    "Mejora la calidad eliminando el texto de navegación, encabezado, pie de página y barra lateral.",
  "crawl.source.form.unreachable": "Inalcanzable",
  "crawl.source.form.updateSource": "Fuente de actualización",
  "crawl.source.form.updateSourceA11y": "Fuente de actualización",
  "crawl.source.form.url": "URL del sitio web",
  "crawl.source.form.urlHint":
    "Si ingresa una URL con una ruta, los widgets permitirán de manera predeterminada solo esa página.",
  "crawl.source.sheet.addTitle": "Agregar nueva fuente de rastreo",
  "crawl.source.sheet.editTitle": "Editar fuente de rastreo",
  "crawl.source.sheet.subtitle":
    "Configure un nuevo sitio web o fuente de documentación para rastrear e indexar.",
  "crawl.sources": "Fuentes",
  "crawl.start": "Iniciar Rastreo",
  "crawl.status.ready": "Listo",
  "crawl.status.readyA11y": "Listo para la búsqueda",
  "crawl.stop": "Detener Rastreo",
  "crawl.table.col.cadence": "Frecuencia",
  "crawl.table.col.status": "Estado",
  "crawl.table.col.training": "Entrenamiento",
  "crawl.table.status.active": "Activo",
  "crawl.table.status.failed": "Fallido",
  "crawl.table.status.inactive": "Inactivo",
  "crawl.table.status.indexing": "Indexando",
  "crawl.table.status.pending": "Pendiente",
  "crawl.table.status.queued": "En cola",
  "crawl.table.status.running": "En ejecución",
  "crawl.table.status.unknown": "Desconocido",
  "crawl.table.status.waiting": "En espera",
  "crawl.table.training.pending": "Pendiente",
  "crawl.tabs.document": "Documento",
  "crawl.tabs.domain": "Dominio",
  "crawl.title": "Gestión de Rastreo",
  "crawl.toast.crawlAlreadyRunning.description":
    "Ya hay un trabajo de rastreo activo o en cola para esta fuente.",
  "crawl.toast.crawlAlreadyRunning.title": "Ya en ejecución",
  "crawl.toast.crawlLimitReached.description":
    "Todos los espacios de rastreo {{count}} están llenos. Inténtelo de nuevo más tarde cuando finalice el rastreo. Consulte sus notificaciones para obtener más detalles.",
  "crawl.toast.crawlLimitReached.title": "Límite de rastreo alcanzado",
  "crawl.toast.crawlQueued.description":
    "Todos los espacios de rastreo están ocupados. Tu rastreo comenzará automáticamente cuando se libere un espacio.",
  "crawl.toast.crawlQueued.title": "Rastreo en cola",
  "crawl.toast.crawlStarted.description":
    "El trabajo de rastreo se ha iniciado",
  "crawl.toast.crawlStarted.title": "Rastreo iniciado",
  "crawl.toast.crawlStartedShort": "Rastreo iniciado",
  "crawl.toast.crawlStartFailed":
    "No se pudo iniciar el rastreo. Inténtalo de nuevo.",
  "crawl.toast.gmailRefreshed":
    "Se actualizaron el estado de Gmail, la bandeja de entrada y los correos electrónicos indexados.",
  "crawl.toast.jobRefreshed": "Trabajo actualizado",
  "crawl.toast.refreshed.documentDescription":
    "Los documentos se han actualizado.",
  "crawl.toast.refreshed.domainDescription":
    "Las fuentes de rastreo se han actualizado.",
  "crawl.toast.refreshed.title": "Datos actualizados",
  "crawl.toast.siteAdded.description": "Se añadió correctamente {{name}}",
  "crawl.toast.siteAdded.title": "Fuente añadida",
  "crawl.toast.siteAddFailed":
    "No se pudo añadir la fuente. Inténtalo de nuevo.",
  "crawl.toast.siteDeleted.description": "La fuente se eliminó correctamente",
  "crawl.toast.siteDeleted.title": "Fuente eliminada",
  "crawl.toast.siteDeleteFailed":
    "No se pudo eliminar la fuente. Inténtalo de nuevo.",
  "crawl.toast.siteUpdated.description":
    "La configuración de la fuente se actualizó correctamente",
  "crawl.toast.siteUpdated.title": "Fuente actualizada",
  "crawl.toast.siteUpdateFailed":
    "No se pudo actualizar la fuente. Inténtalo de nuevo.",
  "crawl.toast.sourceAdded": "Fuente agregada",
  "crawl.toast.sourceDeleted": "Fuente eliminada",
  "crawl.toast.sourceUpdated": "Fuente actualizada",
  "documents.a11y.openDocument": "Abierto {{name}}",
  "documents.a11y.selectDocument": "Seleccione {{name}}",
  "documents.avgChunks": "Fragmentos Promedio",
  "documents.bulk.clearSelection": "Borrar selección",
  "documents.bulk.reindex": "Reindexar",
  "documents.bulk.selectAll": "Seleccionar todo",
  "documents.bulk.selectedCountMany": "{{count}} documentos seleccionados",
  "documents.bulk.selectedCountOne": "{{count}} documento seleccionado",
  "documents.chunks": "{{count}} fragmentos",
  "documents.coverage.missingBanner":
    "El documento {{count}} necesita volver a indexarse ​​para el modelo de incrustación activo.",
  "documents.coverage.missingBannerPlural":
    "Es necesario volver a indexar {{count}} documentos para el modelo de incrustación activo.",
  "documents.description": "Gestiona tus documentos indexados y contenido",
  "documents.details.checksum": "Suma de verificación",
  "documents.details.chunks": "Fragmentos",
  "documents.details.chunksCreated": "{{count}} fragmentos de texto creados",
  "documents.details.closeA11y": "Cerrar detalles del documento",
  "documents.details.description":
    "Ver metadatos del documento e información de procesamiento",
  "documents.details.descriptionField": "Descripción",
  "documents.details.fileSize": "Tamaño del archivo",
  "documents.details.language": "Idioma",
  "documents.details.lastIndexed": "Última indexación",
  "documents.details.sourceDomain": "Dominio de origen",
  "documents.details.sourceUrl": "URL de origen",
  "documents.details.title": "Detalles del documento",
  "documents.editSubtitle":
    "Actualizar los detalles del documento. Los cambios se reflejan en la base de datos.",
  "documents.editTitle": "Editar documento",
  "documents.embedding.currentModel": "actual",
  "documents.embedding.missingActive":
    "No incrustado con el modelo de chat actual",
  "documents.embedding.missingActiveA11y":
    "Falta cobertura del modelo de incrustación activa",
  "documents.embedding.missingActiveDetail":
    "No incrustado con el modelo de chat activo ({{provider}} / {{model}}). Reindexe para hacerlo buscable en el chat.",
  "documents.embedding.modelsLabel": "Modelos incrustados",
  "documents.embedding.none": "Ninguno",
  "documents.empty.action": "Subir documento",
  "documents.empty.default": "No se encontraron documentos",
  "documents.empty.filter": "Ningún documento coincide con tus filtros.",
  "documents.empty.search":
    "No se encontraron documentos que coincidan con tu búsqueda",
  "documents.empty.uploadHint":
    "Cargue archivos PDF o documentos para ponerlos en cola para su indexación.",
  "documents.fields.indexed": "Indexado",
  "documents.fields.language": "Idioma",
  "documents.fields.size": "Tamaño",
  "documents.fields.source": "Fuente",
  "documents.fields.type": "Tipo",
  "documents.filters.status": "Estado",
  "documents.filters.statusAll": "Todos los estados",
  "documents.filters.type": "Tipo",
  "documents.filters.typeAll": "Todos los tipos",
  "documents.filters.typeDoc": "Documentos",
  "documents.form.descriptionOptional": "Descripción (opcional)",
  "documents.form.descriptionPlaceholder":
    "Breve descripción del contenido del documento...",
  "documents.form.sourceCollection": "Colección fuente",
  "documents.form.sourceCollectionPlaceholder": "por ejemplo, cargas manuales",
  "documents.form.titleOptional": "Título (opcional)",
  "documents.form.titlePlaceholder":
    "Título del documento o déjelo vacío para usar el nombre del archivo",
  "documents.indexSummary":
    "{{total}} archivos · {{indexed}} indexados · {{chunks}} fragmentos de índice",
  "documents.indexSummaryEmpty":
    "Aún no hay archivos subidos. Sube un documento para ver los totales del índice.",
  "documents.indexSummaryVisible": "(mostrando {{visible}} de {{total}})",
  "documents.inspector.chunkLabel": "Trozo {{index}}",
  "documents.inspector.contentNotAvailable":
    "Vista previa del contenido no disponible.",
  "documents.inspector.loadContent": "Cargar contenido",
  "documents.inspector.loadFailed":
    "No se pudo cargar el contenido del documento.",
  "documents.inspector.loading": "Cargando documento…",
  "documents.inspector.loadMore": "Cargar más ({{loaded}} / {{total}})",
  "documents.inspector.noChunks":
    "No se encontraron fragmentos para este documento.",
  "documents.inspector.noChunksIndexed": "Aún no se han indexado fragmentos.",
  "documents.inspector.open": "Abierta",
  "documents.inspector.openExternal": "Abierto externamente",
  "documents.inspector.previewInlineUnavailable":
    "La vista previa no está disponible en línea para este tipo de archivo. Utilice Abrir para ver externamente.",
  "documents.inspector.subtitle":
    "Inspeccione el contenido extraído y los fragmentos indexados.",
  "documents.inspector.tabChunks": "trozos",
  "documents.inspector.tabChunksCount": "Trozos ({{count}})",
  "documents.inspector.tabContent": "Contenido",
  "documents.inspector.title": "Inspectora de documentos",
  "documents.list.column.document": "Documento",
  "documents.list.column.size": "Tamaño",
  "documents.list.column.typeStatus": "Tipo / Estado",
  "documents.loadFailed": "No se pudieron cargar los documentos",
  "documents.loading": "Cargando documentos...",
  "documents.newThisWeek": "Nuevos Esta Semana",
  "documents.previewAlert":
    "Vista previa: {{title}} \n\nLa vista previa del archivo se abrirá cuando la URL del documento esté disponible.",
  "documents.previewUnavailable":
    "La vista previa del documento aún no está disponible.",
  "documents.reindexButtonInProgress": "Reindexando…",
  "documents.reindexFailedSoFar": "({{count}} fallidos hasta ahora)",
  "documents.reindexInProgressBody":
    "Búsqueda: {{searchDone}} / {{searchTotal}} · Chat: {{chatDone}} / {{chatTotal}}",
  "documents.reindexInProgressStarting":
    "Iniciando reindexación de embeddings para búsqueda y chat…",
  "documents.reindexInProgressTitle": "Reindexación en curso",
  "documents.routePlaceholder":
    "Marcador de posición del módulo de documentos con cableado de ruta y navegación listo.",
  "documents.search": "Buscar documentos...",
  "documents.status.extracting": "Extrayendo",
  "documents.status.indexed": "Indexado",
  "documents.status.indexedForModel": "Indexado",
  "documents.status.indexing": "Indexando",
  "documents.status.processed": "Procesado",
  "documents.status.processing": "Procesando",
  "documents.status.queued": "En cola",
  "documents.title": "Documentos",
  "documents.toast.bulkDeleted.descriptionMany":
    "Se eliminaron correctamente {{count}} documentos",
  "documents.toast.bulkDeleted.descriptionOne":
    "Se eliminó correctamente {{count}} documento",
  "documents.toast.bulkDeleted.title": "Documentos eliminados",
  "documents.toast.bulkDeletedCountMany": "{{count}} documentos eliminados",
  "documents.toast.bulkDeletedCountOne": "Documento eliminado",
  "documents.toast.bulkDeleteFailed":
    "No se pudieron eliminar algunos documentos. Inténtalo de nuevo.",
  "documents.toast.deleted.description":
    "El documento se ha eliminado correctamente",
  "documents.toast.deleted.title": "Documento eliminado",
  "documents.toast.deleteFailed":
    "No se pudo eliminar el documento. Inténtalo de nuevo.",
  "documents.toast.opened": "Abierto {{title}}",
  "documents.toast.reindexComplete": "Documentos reindexados",
  "documents.toast.reindexCompleteWithErrors":
    "Reindexación de documentos completada con errores.",
  "documents.toast.reindexDocumentsComplete.description":
    "La actualización de embeddings de tus documentos ha terminado.",
  "documents.toast.reindexDocumentsComplete.title": "Documentos reindexados",
  "documents.toast.reindexDocumentsCompleteFailed.descriptionFallback":
    "El trabajo de embedding notificó un error. Consulta la configuración de Búsqueda o Chatbot para más detalles.",
  "documents.toast.reindexDocumentsCompleteFailed.title":
    "Error en la reindexación",
  "documents.toast.reindexDocumentsCompletePartial.description":
    "{{failed}} paso(s) de embedding notificaron fallos. Actualiza la lista y vuelve a intentarlo si hace falta.",
  "documents.toast.reindexDocumentsCompletePartial.descriptionGeneric":
    "La reindexación terminó con fallos. Actualiza la lista y vuelve a intentarlo si hace falta.",
  "documents.toast.reindexDocumentsCompletePartial.title":
    "Reindexación terminada con incidencias",
  "documents.toast.reindexFailed":
    "No se pudieron reindexar los documentos. Inténtalo de nuevo.",
  "documents.toast.reindexNoProject":
    "Selecciona un proyecto antes de reindexar.",
  "documents.toast.reindexNoSelection":
    "Selecciona al menos un documento para reindexar.",
  "documents.toast.reindexProjectPartial.body":
    "Un modo se inició; el otro falló: {{detail}}",
  "documents.toast.reindexProjectPartial.title":
    "Reindexación parcialmente iniciada",
  "documents.toast.reindexProjectStarted.body":
    "La reindexación de embeddings se está ejecutando para búsqueda y chat en todo el proyecto. Consulta el progreso en la configuración de Búsqueda o Chatbot.",
  "documents.toast.reindexProjectStarted.bodyDocumentsOnly":
    "Re-embebiendo {{count}} archivo(s) subido(s) seleccionado(s) (las URLs rastreadas no cambian). Consulta el progreso en la configuración de Búsqueda o Chatbot.",
  "documents.toast.reindexProjectStarted.bodyFromDoc":
    'La reindexación de embeddings se está ejecutando para búsqueda y chat en todo el proyecto (abierta desde "{{title}}").',
  "documents.toast.reindexProjectStarted.bodyFromDocDocumentsOnly":
    'Re-embebiendo {{count}} archivo(s) seleccionado(s) de este proyecto (abierta desde "{{title}}"); las URLs rastreadas no cambian. Consulta el progreso en la configuración de Búsqueda o Chatbot.',
  "documents.toast.reindexProjectStarted.bodySharedIndex":
    "Búsqueda y chat usan el mismo modelo de embeddings; una sola reindexación actualiza ambos. Consulta el progreso en la configuración de Búsqueda o Chatbot.",
  "documents.toast.reindexProjectStarted.bodySharedIndexDocumentsOnly":
    "Búsqueda y chat comparten el mismo modelo: una reindexación actualiza {{count}} archivo(s) seleccionado(s) (URLs rastreadas sin cambios). Consulta el progreso en la configuración de Búsqueda o Chatbot.",
  "documents.toast.reindexProjectStarted.title": "Reindexación iniciada",
  "documents.toast.reindexStarted.descriptionMany":
    "Reindexando {{count}} documentos. Esta función puede requerir soporte de la API del backend.",
  "documents.toast.reindexStarted.descriptionOne":
    "Reindexando {{count}} documento. Esta función puede requerir soporte de la API del backend.",
  "documents.toast.reindexStarted.descriptionTitle": "Reindexando {{title}}",
  "documents.toast.reindexStarted.title": "Reindexación iniciada",
  "documents.toast.reindexStartedShort": "Reindexación de documentos iniciada",
  "documents.toast.updated.description": "Cambios guardados correctamente",
  "documents.toast.updated.title": "Documento actualizado",
  "documents.toast.uploaded.description":
    "Los documentos se han subido correctamente.",
  "documents.toast.uploaded.title": "Documentos subidos",
  "documents.total": "Total de Documentos",
  "documents.totalSize": "Tamaño Total",
  "documents.upload": "Subir Documento",
  "documents.upload.allSkipped":
    "Se omitieron todos los archivos seleccionados (formatos no compatibles).",
  "documents.upload.alreadyInProgress": "Carga ya en progreso.",
  "documents.upload.chooseFileError": "Elija un archivo para cargar.",
  "documents.upload.chooseFiles": "Elija archivos",
  "documents.upload.chooseFilesA11y": "Elige archivos",
  "documents.upload.filesQueued": "{{count}} archivo en cola",
  "documents.upload.filesQueuedPlural": "{{count}} archivos en cola",
  "documents.upload.folderModeHint":
    "Modo carpeta: lee todos los archivos de forma recursiva. Solo se cargan PDF, DOC, DOCX, TXT, MD, HTML.",
  "documents.upload.readingFiles": "Leyendo archivos…",
  "documents.upload.selectFiles": "Seleccionar archivos",
  "documents.upload.selectFolder": "Seleccionar carpeta",
  "documents.upload.skippedUnsupported": "· {{count}} omitida (no compatible)",
  "documents.upload.summaryAllFailed":
    "Todas las cargas de {{total}} fallaron.",
  "documents.upload.summaryPartial":
    "{{succeeded}} de {{total}} subido; {{failed}} falló.",
  "documents.upload.uploadAsFolder": "Subir como carpeta",
  "documents.upload.uploadAsFolderA11y": "Subir como carpeta",
  "documents.uploadButtonInProgress": "Subiendo {{done}} / {{total}}",
  "documents.uploadDialogDescription":
    "Sube documentos para indexarlos y usarlos en búsqueda y chat.",
  "documents.uploadDialogDescriptionActive":
    "Ya hay una carga en curso. Puedes ver el progreso abajo o en la pestaña Documentos.",
  "documents.uploadFailedSoFar": "({{count}} fallidos hasta ahora)",
  "documents.uploadInProgressBody":
    "{{done}} de {{total}} archivos completados.",
  "documents.uploadInProgressTitle": "Carga en curso",
  "documents.uploadProgress": "Subiendo {{done}} de {{total}} archivos...",
  "documents.uploadProgressFailed": "({{count}} falló)",
  "documents.uploadProgressShort": "Subiendo {{done}}/{{total}}{{failed}}…",
  "documents.uploadTitle": "Cargar documentos",
  "documents.view.grid": "Vista de cuadrícula",
  "documents.view.list": "Vista de lista",
  "documents.view.modeA11y": "Modo de visualización de documentos",
  "drawer.appearance": "Apariencia",
  "drawer.language": "Idioma",
  "drawer.preferences": "Preferencias",
  "empty.documents.cta.addSource": "Agregar fuente de rastreo",
  "empty.documents.cta.upload": "Cargar documentos",
  "empty.documents.description":
    "Cargue documentos o configure fuentes de rastreo para comenzar.",
  "empty.documents.title": "No se encontraron documentos",
  "empty.feedback.cta": "Ver análisis",
  "empty.feedback.description":
    "Los comentarios de los usuarios aparecerán aquí una vez que la gente comience a usar su asistente de IA.",
  "empty.feedback.title": "Aún no hay comentarios",
  "empty.queries.cta": "Probar una consulta",
  "empty.queries.description":
    "Comience a usar su sistema RAG para ver análisis de consultas aquí.",
  "empty.queries.title": "Aún no hay consultas",
  "errors.api.invalidReindexResponse": "Respuesta de reindexación no válida.",
  "errors.api.invalidResponse": "Respuesta no válida del servidor.",
  "errors.api.saveAllowedDomainsFailed":
    "Error al guardar dominios permitidos: respuesta no válida.",
  "errors.api.saveDomainsFailed":
    "Error al guardar dominios: respuesta no válida.",
  "errors.apiKeys.invalidResponse": "Respuesta de clave API no válida.",
  "errors.apiKeys.revealFailed": "No se pudo revelar la clave API.",
  "errors.auth.emailVerificationFailed":
    "Error en la verificación del correo electrónico.",
  "errors.auth.invalidLoginResponse":
    "Respuesta de inicio de sesión no válida del servidor.",
  "errors.auth.invalidVerificationResponse":
    "Respuesta de verificación de autenticación no válida.",
  "errors.auth.publicConfigFailed":
    "No se pudo cargar la configuración pública de autenticación.",
  "errors.auth.ssoHydrateFailed":
    "No se pudo completar el inicio de sesión SSO.",
  "errors.auth.twoFactorTokenMissing":
    "Se requiere autenticación de dos factores pero no se devolvió token de verificación.",
  "errors.chat.emptyMessage": "Escriba un mensaje.",
  "errors.chat.emptyResponse": "Respuesta vacía del servicio de chat.",
  "errors.chat.emptyStreamResponse":
    "El servidor de chat devolvió una respuesta vacía. Inténtelo de nuevo.",
  "errors.chat.missingSession": "Falta la sesión de chat para el feedback.",
  "errors.chat.streamNoBody":
    "La respuesta del flujo de búsqueda no incluía cuerpo.",
  "errors.compare.emptyQuery": "Introduzca una consulta para comparar modelos.",
  "errors.compare.requestFailed": "Error en la solicitud de comparación.",
  "errors.confluence.authUrlFailed":
    "No se pudo obtener la URL de autorización de Confluence.",
  "errors.crawl.jobNotFound": "Trabajo no encontrado.",
  "errors.crawl.jobStatusFailed": "No se pudo cargar el estado del trabajo.",
  "errors.crawl.sourceNotFound": "Fuente no encontrada.",
  "errors.documents.aiUnavailable":
    "El servicio de IA no está disponible. Inténtelo de nuevo en unos minutos.",
  "errors.documents.chooseFile": "Elija un archivo para subir.",
  "errors.documents.contentTokenFailed":
    "No se pudo obtener el token de contenido.",
  "errors.documents.fileTooLarge":
    "Este archivo es demasiado grande. El tamaño máximo permitido es 50 MB.",
  "errors.documents.loadContentFailed":
    "No se pudo cargar el contenido del documento.",
  "errors.documents.uploadFailed": "Error al subir.",
  "errors.documents.uploadQueueFull":
    "La cola de subida está llena. Espere a que terminen las subidas actuales e inténtelo de nuevo.",
  "errors.domains.alreadyExists": "El dominio ya existe",
  "errors.domains.invalidUrl": "Introduzca un dominio o URL válido.",
  "errors.domains.urlAlreadyAllowlisted":
    "Esta URL ya está en la lista de permitidos.",
  "errors.export.failed": "Error al exportar.",
  "errors.feedback.invalidEntriesResponse":
    "Respuesta de entradas de feedback no válida.",
  "errors.feedback.invalidSummaryResponse":
    "Respuesta de resumen de feedback no válida.",
  "errors.gmail.authUrlFailed":
    "No se pudo obtener la URL de autorización de Gmail.",
  "errors.gmail.authUrlUnsupported":
    "No se puede abrir la URL de autorización de Gmail.",
  "errors.googleDrive.authUrlFailed":
    "No se pudo obtener la URL de autorización de Google Drive.",
  "errors.health.missingService":
    'Falta el servicio "{{name}}" en la carga de salud',
  "errors.history.invalidMessageResponse":
    "Respuesta de mensaje de chat no válida.",
  "errors.history.invalidResponse":
    "Respuesta del historial de chat no válida.",
  "errors.network.noResponse":
    "Sin respuesta del servidor. Compruebe su conexión a Internet.",
  "errors.network.requestFailed": "La solicitud falló.",
  "errors.network.uploadFailed": "Error al subir.",
  "errors.notFound.cta.back": "Volver",
  "errors.notFound.cta.home": "Volver al panel",
  "errors.notFound.description":
    "La página que busca no existe o se ha movido.",
  "errors.notFound.title": "Página no encontrada",
  "errors.notion.authUrlFailed":
    "No se pudo obtener la URL de autorización de Notion.",
  "errors.onboarding.noTestAnswer":
    "No se recibió respuesta de la consulta de prueba.",
  "errors.permission.cta.home": "Volver al panel",
  "errors.permission.cta.retry": "Reintentar",
  "errors.permission.description":
    "No tiene permiso para acceder a este recurso. Contacte a su administrador si cree que es un error.",
  "errors.permission.title": "Acceso denegado",
  "errors.project.selectFirst": "Seleccione primero un proyecto activo.",
  "errors.projectRequired": "Seleccione primero un proyecto activo.",
  "errors.search.emptyQuery":
    "Introduzca una consulta para probar la búsqueda.",
  "errors.search.invalidHistoryResponse":
    "Respuesta del historial de búsqueda no válida.",
  "errors.search.invalidTestResponse":
    "Respuesta de prueba de búsqueda no válida.",
  "errors.search.minQueryLength": "Introduzca al menos 3 caracteres",
  "errors.search.sessionUnavailable":
    "Sesión de búsqueda no disponible. Ejecute otra prueba de búsqueda antes de enviar feedback.",
  "errors.search.streamFailed": "Error en el flujo de búsqueda.",
  "errors.server.cta.home": "Volver al panel",
  "errors.server.cta.reload": "Recargar página",
  "errors.server.description":
    "Estamos experimentando dificultades técnicas. Inténtelo de nuevo en unos momentos.",
  "errors.server.title": "Algo salió mal",
  "errors.sharepoint.authUrlFailed":
    "No se pudo obtener la URL de autorización de SharePoint.",
  "errors.slack.authUrlFailed":
    "No se pudo obtener la URL de autorización de Slack.",
  "feedback.description":
    "Revisa y analiza los comentarios de los usuarios sobre las respuestas de IA",
  "feedback.detail.subtitle": "Mensaje, fuentes y moderación.",
  "feedback.detail.title": "Detalle de comentarios",
  "feedback.title": "Moderación de Comentarios",
  "feedbackModeration.col.preview": "Vista previa de respuesta",
  "feedbackModeration.col.query": "Consulta de usuario",
  "feedbackModeration.col.reasons": "Razones",
  "feedbackModeration.col.vote": "Votar",
  "feedbackModeration.description":
    "Revisa y analiza los comentarios de los usuarios sobre las respuestas de IA",
  "feedbackModeration.detail.answer": "Respuesta del asistente",
  "feedbackModeration.detail.comment": "Comentario",
  "feedbackModeration.detail.confidence": "Confianza",
  "feedbackModeration.detail.ids": "identificaciones",
  "feedbackModeration.detail.loadingAnswer": "Cargando respuesta completa…",
  "feedbackModeration.detail.messageId": "mensaje",
  "feedbackModeration.detail.modelEmbedding": "Modelo de incrustación",
  "feedbackModeration.detail.modelLlm": "modelo de lenguaje",
  "feedbackModeration.detail.models": "Modelos",
  "feedbackModeration.detail.noComment": "Sin comentarios escritos",
  "feedbackModeration.detail.partialPreview":
    "No se pudo cargar el mensaje completo. Mostrando vista previa guardada de la lista.",
  "feedbackModeration.detail.query": "Consulta de usuario",
  "feedbackModeration.detail.rating": "Clasificación",
  "feedbackModeration.detail.reasons": "Etiquetas de motivo",
  "feedbackModeration.detail.responseTime": "Tiempo de respuesta",
  "feedbackModeration.detail.section.conversation": "Contenido del mensaje",
  "feedbackModeration.detail.section.moderation": "Moderación",
  "feedbackModeration.detail.sessionId": "sesión",
  "feedbackModeration.detail.sources": "Fuentes",
  "feedbackModeration.detail.submittedAt": "Enviada",
  "feedbackModeration.detail.subtitle":
    "Mensaje y fuentes primero, luego cómo lo calificó el usuario y sus acciones de moderación.",
  "feedbackModeration.detail.title": "Detalle de comentarios",
  "feedbackModeration.detail.userFeedback": "Comentarios de los usuarios",
  "feedbackModeration.detail.vote": "Votar",
  "feedbackModeration.detail.voteNegative": "Negativa",
  "feedbackModeration.detail.votePositive": "Positiva",
  "feedbackModeration.empty": "Aún no hay comentarios para este proyecto.",
  "feedbackModeration.export": "Exportar",
  "feedbackModeration.exportCsv": "Descargar CSV",
  "feedbackModeration.exportJson": "Descargar JSON",
  "feedbackModeration.filter.allVotes": "Todos los votos",
  "feedbackModeration.filter.negative": "Solo negativo",
  "feedbackModeration.filter.positive": "Solo positiva",
  "feedbackModeration.flagged": "Marcada",
  "feedbackModeration.list.openDetails": "Abrir detalles de comentarios",
  "feedbackModeration.loading": "Cargando…",
  "feedbackModeration.loadMore": "Cargar más",
  "feedbackModeration.moderation.flag": "Respuesta de bandera",
  "feedbackModeration.moderation.flagReasonInput":
    "¿Por qué se marca esta respuesta?",
  "feedbackModeration.moderation.flagReasonPlaceholder":
    "Motivo de la marca (opcional)",
  "feedbackModeration.moderation.markReviewed": "Marcar como revisado",
  "feedbackModeration.moderation.notes": "Notas internas",
  "feedbackModeration.moderation.notesA11y": "Notas de moderación interna",
  "feedbackModeration.moderation.notesPlaceholder":
    "Agregue una nueva nota (reemplaza la nota guardada cuando guarda)…",
  "feedbackModeration.moderation.save": "Guardar moderación",
  "feedbackModeration.moderation.savedEmpty":
    "Aún no se ha guardado ninguna moderación para este mensaje.",
  "feedbackModeration.moderation.savedTitle": "Moderación guardada",
  "feedbackModeration.moderation.updateTitle": "Moderación de actualización",
  "feedbackModeration.reason.accuracy": "Exactitud",
  "feedbackModeration.reason.accurate": "Precisa",
  "feedbackModeration.reason.clarity": "Claridad",
  "feedbackModeration.reason.clear": "Clara",
  "feedbackModeration.reason.complete": "Completa",
  "feedbackModeration.reason.completeness": "Lo completo",
  "feedbackModeration.reason.fast_response": "Respuesta rápida",
  "feedbackModeration.reason.hallucinated": "Alucinada",
  "feedbackModeration.reason.helpful": "Útil",
  "feedbackModeration.reason.helpfulness": "Utilidad",
  "feedbackModeration.reason.incorrect": "Incorrecta",
  "feedbackModeration.reason.low_quality": "Baja calidad",
  "feedbackModeration.reason.missing_sources": "Fuentes faltantes",
  "feedbackModeration.reason.other": "Otra",
  "feedbackModeration.reason.outdated_information":
    "Información desactualizada",
  "feedbackModeration.reason.poor_formatting": "Mal formato",
  "feedbackModeration.reason.relevance": "Pertinencia",
  "feedbackModeration.reason.slow_response": "Respuesta lenta",
  "feedbackModeration.reason.speed": "Velocidad",
  "feedbackModeration.reason.too_technical": "Demasiado técnica",
  "feedbackModeration.reviewed": "Revisada",
  "feedbackModeration.searchPlaceholder":
    "Consulta de búsqueda o texto de respuesta…",
  "feedbackModeration.summary.avgMs": "Tiempo medio de respuesta (ms)",
  "feedbackModeration.summary.flagged": "Marcada",
  "feedbackModeration.summary.negativePct": "Negativo %",
  "feedbackModeration.summary.positivePct": "Positivo %",
  "feedbackModeration.summary.reviewed": "Revisada",
  "feedbackModeration.summary.topNegativeReasons":
    "Razones negativas más comunes",
  "feedbackModeration.summary.total": "Comentarios totales",
  "feedbackModeration.summary.votes": "votos",
  "feedbackModeration.table.subtitle":
    "Lo más nuevo primero. Cada tarjeta abre el hilo completo, las fuentes y el panel de moderación.",
  "feedbackModeration.table.title": "Entradas de comentarios",
  "feedbackModeration.title": "Moderación de Comentarios",
  "feedbackModeration.toast.exported": "Exportación iniciada",
  "feedbackModeration.toast.exportFailed": "Exportación fallida",
  "feedbackModeration.toast.saved":
    "Moderación guardada en este mensaje en la base de datos.",
  "feedbackModeration.toast.saveFailed": "No se pudo guardar la moderación",
  "forgot-password.errors.emailRequired":
    "Por favor ingrese su dirección de correo electrónico",
  "forgot-password.errors.generic":
    "Algo salió mal. Por favor inténtalo de nuevo.",
  "forgot-password.form.back": "Volver a iniciar sesión",
  "forgot-password.form.email.label": "Dirección de correo electrónico",
  "forgot-password.form.email.placeholder": "tu@ejemplo.com",
  "forgot-password.form.submit": "Enviar enlace de reinicio",
  "forgot-password.form.submitting": "Enviando enlace de reinicio...",
  "forgot-password.form.subtitle":
    "Ingrese su dirección de correo electrónico y le enviaremos un enlace de reinicio.",
  "forgot-password.form.title": "Has olvidado tu contraseña",
  "forgot-password.hero.description":
    "Ingrese el correo electrónico asociado con su cuenta y le enviaremos un enlace para restablecer su contraseña. Siempre puedes regresar a la página de inicio de sesión una vez que estés listo para iniciar sesión nuevamente.",
  "forgot-password.hero.title": "Restablece tu contraseña de forma segura",
  "forgot-password.success.sent":
    "Si existe una cuenta para este correo electrónico, se ha enviado un enlace para restablecer la contraseña.",
  "gmail.actions.pauseAutoSync": "Pausar sincronización automática",
  "gmail.actions.resumeAutoSync": "Reanudar sincronización automática",
  "gmail.actions.syncNow": "Sincronizar ahora",
  "gmail.confirm.disconnectMessage":
    "¿Desconectar Gmail? Los correos electrónicos indexados de Gmail y las vistas previas de la bandeja de entrada se eliminarán de este proyecto.",
  "gmail.confirm.disconnectTitle": "¿Desconectar Gmail?",
  "gmail.connect.description":
    "Agregue las credenciales de su aplicación Google OAuth para este proyecto y luego conecte su cuenta de Gmail.",
  "gmail.connect.subtitle":
    "Almacenado de forma segura en el backend solo para este proyecto",
  "gmail.connect.title": "Conecta tu Gmail",
  "gmail.description":
    "Conecte Gmail para recuperar los mensajes de la bandeja de entrada aquí; elija qué correos electrónicos indexar para el chatbot.",
  "gmail.error.banner":
    "La integración encontró un error. Intente volver a conectarse.",
  "gmail.form.clientId": "ID de cliente de Google",
  "gmail.form.clientSecret": "Secreto del cliente de Google",
  "gmail.form.connectGmail": "Conectar Gmail",
  "gmail.form.copyRedirectA11y": "Copiar URI de redireccionamiento",
  "gmail.form.redirectUri": "URI de redireccionamiento",
  "gmail.form.redirectUriHint":
    "Agregue esta URL exacta en OAuth → URI de redireccionamiento autorizados.",
  "gmail.form.resetRedirectA11y": "Restablecer URI de redireccionamiento",
  "gmail.form.saveBeforeConnect":
    "Guarde las credenciales antes de conectarse a Gmail.",
  "gmail.form.saveCredentials": "Guardar credenciales",
  "gmail.form.selectProject": "Seleccione primero un proyecto activo.",
  "gmail.inbox.dismissSelected": "Descartar seleccionado",
  "gmail.inbox.empty":
    "No hay mensajes esperando. Ejecute Sync Now para extraer el correo de Gmail.",
  "gmail.inbox.indexSelected": "Índice seleccionado ({{count}})",
  "gmail.inbox.loadMore": "Cargar más ({{visible}} / {{total}})",
  "gmail.inbox.selectAllPages": "Seleccionar todas las páginas",
  "gmail.inbox.selectVisible": "Seleccionar visible",
  "gmail.inbox.showing":
    "Mostrando {{visible}} de {{total}} en la bandeja de entrada",
  "gmail.inbox.subtitle":
    "La sincronización recupera nuevos mensajes de Gmail aquí. Elija Índice seleccionado para incrustarlos en la búsqueda de chat o Descartar para omitirlos.",
  "gmail.inbox.title": "Bandeja de entrada (revisar antes de indexar)",
  "gmail.indexed.deleteEmailA11y": "Eliminar correo electrónico",
  "gmail.indexed.editEmailA11y": "Editar correo electrónico",
  "gmail.indexed.empty":
    "Aún no se han indexado mensajes de Gmail. Sync lleva el correo a la bandeja de entrada; Elija Índice seleccionado para agregar correos electrónicos aquí.",
  "gmail.indexed.subtitle":
    "Mensajes de Gmail indexados para búsqueda de chat.",
  "gmail.indexed.title": "Correos electrónicos indexados",
  "gmail.indexed.viewEmailA11y": "Ver correo electrónico",
  "gmail.jobs.duration": "· {{seconds}}s",
  "gmail.jobs.empty": "Aún no hay trabajos de sincronización.",
  "gmail.jobs.fetchedIndexed":
    "{{fetched}} recuperado en la bandeja de entrada · {{indexed}} indexado en el trabajo",
  "gmail.jobs.subtitle": "Actividad reciente de sincronización de Gmail",
  "gmail.jobs.title": "Sincronizar trabajos",
  "gmail.refresh": "Refrescar",
  "gmail.stats.autoSyncEvery": "Sincronización automática cada",
  "gmail.stats.awaitingReview": "En espera de revisión",
  "gmail.stats.indexedForChat": "Indexado para chatear",
  "gmail.stats.lastSynced": "Última sincronización",
  "gmail.status.subtitle": "Estado de integración conectado",
  "gmail.sync.inProgress":
    "Sincronización en curso: recuperando correo en su bandeja de entrada...",
  "gmail.title": "Integración de Gmail",
  "gmail.toast.authOpened": "Autorización de Gmail abierta",
  "gmail.toast.autoSyncPaused": "Sincronización automática de Gmail pausada",
  "gmail.toast.autoSyncResumed":
    "Se reanudó la sincronización automática de Gmail",
  "gmail.toast.connected":
    "Gmail conectado. Su cuenta de Gmail se ha vinculado correctamente.",
  "gmail.toast.credentialsSaved": "Credenciales guardadas",
  "gmail.toast.disconnected": "Gmail desconectada",
  "gmail.toast.dismissed":
    "Mensajes seleccionados eliminados de la bandeja de entrada",
  "gmail.toast.dismissFailed": "No se pudieron eliminar los mensajes.",
  "gmail.toast.indexed": "Mensaje(s) {{count}} indexados.",
  "gmail.toast.indexedWithErrors":
    "Indexado {{indexed}}. No se pudieron indexar {{errors}} mensajes.",
  "gmail.toast.indexFailed":
    "No se pudieron indexar los mensajes seleccionados.",
  "gmail.toast.redirectCopied":
    "URI de redireccionamiento copiado para Google Cloud Console.",
  "gmail.toast.redirectCopyFailed":
    "No se pudo copiar el URI de redireccionamiento. Por favor inténtalo de nuevo.",
  "gmail.toast.redirectReset": "Restablecimiento de URI de redireccionamiento",
  "gmail.toast.syncStarted": "Se inició la sincronización de Gmail",
  "googleDrive.refresh": "Actualizar",
  "help.description":
    "Comienza rápidamente con guías, tutoriales y documentación completa.",
  "help.explore.expoDocs": "documentación de la exposición",
  "help.explore.intro":
    "Esta aplicación de inicio incluye un ejemplo. \ncódigo para ayudarle a comenzar.",
  "help.explore.learnMore": "Más información",
  "help.explore.sections.animations.bodyMiddle":
    "El componente utiliza el potente",
  "help.explore.sections.animations.bodyPrefix":
    "Esta plantilla incluye un ejemplo de un componente animado. El",
  "help.explore.sections.animations.bodySuffix":
    "biblioteca para animar la apertura de esta pista.",
  "help.explore.sections.animations.title": "animaciones",
  "help.explore.sections.fileRouting.body1Middle": "y",
  "help.explore.sections.fileRouting.body1Prefix":
    "Esta aplicación tiene dos pantallas:",
  "help.explore.sections.fileRouting.body2Prefix": "El archivo de diseño en",
  "help.explore.sections.fileRouting.body2Suffix":
    "configura el navegador de pestañas.",
  "help.explore.sections.fileRouting.title": "Enrutamiento basado en archivos",
  "help.explore.sections.images.bodyMiddle": "y",
  "help.explore.sections.images.bodyPrefix":
    "Para imágenes estáticas, puede utilizar el",
  "help.explore.sections.images.bodySuffix":
    "sufijos para proporcionar archivos para diferentes densidades de pantalla.",
  "help.explore.sections.images.title": "Imágenes",
  "help.explore.sections.platformSupport.bodyPrefix":
    "Puede abrir este proyecto en Android, iOS y la web. Para abrir la versión web, presione",
  "help.explore.sections.platformSupport.bodySuffix":
    "en la terminal que ejecuta este proyecto.",
  "help.explore.sections.platformSupport.title":
    "Soporte para Android, iOS y web",
  "help.explore.sections.themes.bodyPrefix":
    "Esta plantilla admite el modo claro y oscuro. El",
  "help.explore.sections.themes.bodySuffix":
    "El gancho le permite inspeccionar cuál es el esquema de color actual del usuario y, por lo tanto, puede ajustar los colores de la interfaz de usuario en consecuencia.",
  "help.explore.sections.themes.title": "Componentes del modo claro y oscuro",
  "help.explore.title": "Explorar",
  "help.gettingStarted.title": "Primeros Pasos",
  "help.guide.button.continue": "Continuar",
  "help.guide.button.docs": "Documentos",
  "help.guide.button.markComplete": "Marcar como Completado",
  "help.guide.button.readDocs": "Leer Docs",
  "help.guide.button.start": "Comenzar",
  "help.guide.button.watchVideo": "Ver Video",
  "help.guide.difficulty.advanced": "avanzado",
  "help.guide.difficulty.beginner": "principiante",
  "help.guide.difficulty.intermediate": "intermedio",
  "help.guide.steps": "{{completed}}/{{total}} pasos",
  "help.guide.stepsCompleted": "{{completed}}/{{total}} completados",
  "help.guides.configureChatbot.description":
    "Personaliza la apariencia, comportamiento y configuración de IA de tu widget de chatbot.",
  "help.guides.configureChatbot.step1.description":
    "Ve a Chatbot Configuration desde la barra lateral.",
  "help.guides.configureChatbot.step1.title":
    "Navegar a Configuración de Chatbot",
  "help.guides.configureChatbot.step2.description":
    "Personaliza colores, fuentes, posición y configuración del botón de activación.",
  "help.guides.configureChatbot.step2.title": "Configurar Apariencia",
  "help.guides.configureChatbot.step3.description":
    "Elige tu proveedor de IA y configura los ajustes del modelo.",
  "help.guides.configureChatbot.step3.title": "Configurar Modelo de IA",
  "help.guides.configureChatbot.step4.description":
    "Usa la vista previa para probar la configuración de tu chatbot.",
  "help.guides.configureChatbot.step4.title": "Probar tu Chatbot",
  "help.guides.configureChatbot.step5.description":
    "Copia el código de integración y agrégalo a tu sitio web.",
  "help.guides.configureChatbot.step5.title": "Obtener Código de Integración",
  "help.guides.configureChatbot.title": "Configurar tu Chatbot",
  "help.guides.configureSearch.description":
    "Configura y personaliza tu widget de búsqueda con capacidades de búsqueda impulsadas por IA.",
  "help.guides.configureSearch.step1.description":
    "Ve a Search Configuration desde la barra lateral.",
  "help.guides.configureSearch.step1.title":
    "Navegar a Configuración de Búsqueda",
  "help.guides.configureSearch.step2.description":
    "Configura el título de búsqueda, marcador de posición, sugerencias y apariencia.",
  "help.guides.configureSearch.step2.title": "Configurar Ajustes de Búsqueda",
  "help.guides.configureSearch.step3.description":
    "Elige tu proveedor de IA y configura los ajustes del modelo para búsqueda.",
  "help.guides.configureSearch.step3.title": "Configurar Modelo de IA",
  "help.guides.configureSearch.step4.description":
    "Usa la pestaña Search Test para probar tu configuración de búsqueda.",
  "help.guides.configureSearch.step4.title": "Probar tu Búsqueda",
  "help.guides.configureSearch.step5.description":
    "Copia el código de integración y agrégalo a tu sitio web.",
  "help.guides.configureSearch.step5.title": "Obtener Código de Integración",
  "help.guides.configureSearch.title": "Configurar tu Búsqueda",
  "help.guides.setupFirstCrawlSource.description":
    "Aprende cómo agregar y configurar tu primer sitio web para rastreo e indexación.",
  "help.guides.setupFirstCrawlSource.step1.description":
    "Ve a la sección Crawl en la barra lateral y haz clic en la pestaña Sources.",
  "help.guides.setupFirstCrawlSource.step1.title":
    "Navegar a Fuentes de Rastreo",
  "help.guides.setupFirstCrawlSource.step2.description":
    "Haz clic en el botón 'Add Source' e ingresa la URL de tu sitio web.",
  "help.guides.setupFirstCrawlSource.step2.title": "Agregar Nueva Fuente",
  "help.guides.setupFirstCrawlSource.step3.description":
    "Establece la profundidad de rastreo, frecuencia y cualquier patrón de URL.",
  "help.guides.setupFirstCrawlSource.step3.title": "Configurar Ajustes",
  "help.guides.setupFirstCrawlSource.step4.description":
    "Guarda tu fuente y activa el primer trabajo de rastreo.",
  "help.guides.setupFirstCrawlSource.step4.title": "Iniciar Rastreo Inicial",
  "help.guides.setupFirstCrawlSource.title":
    "Configurar tu Primera Fuente de Rastreo",
  "help.guides.setupFirstDocumentSource.description":
    "Aprende cómo cargar y gestionar documentos en tu base de conocimiento.",
  "help.guides.setupFirstDocumentSource.step1.description":
    "Ve a la sección Crawl en la barra lateral y haz clic en la pestaña Documents.",
  "help.guides.setupFirstDocumentSource.step1.title": "Navegar a Documentos",
  "help.guides.setupFirstDocumentSource.step2.description":
    "Haz clic en el botón 'Upload Document' y selecciona tu archivo.",
  "help.guides.setupFirstDocumentSource.step2.title": "Cargar Documento",
  "help.guides.setupFirstDocumentSource.step3.description":
    "Agrega título, descripción y etiquetas a tu documento.",
  "help.guides.setupFirstDocumentSource.step3.title": "Configurar Metadatos",
  "help.guides.setupFirstDocumentSource.step4.description":
    "Espera a que el documento sea procesado e indexado.",
  "help.guides.setupFirstDocumentSource.step4.title": "Procesar Documento",
  "help.guides.setupFirstDocumentSource.title":
    "Configurar tu Primera Fuente de Documento",
  "help.quickLinks.title": "Enlaces Rápidos",
  "help.settings.contactSupport": "Contactar con soporte",
  "help.settings.noResults":
    "No hay temas de ayuda coincidentes. Intente buscar por tema, retención o configuración regional.",
  "help.settings.recommendedTopics": "Temas recomendados",
  "help.settings.searchLabel": "Buscar temas de ayuda",
  "help.settings.searchPlaceholder":
    "Buscar documentos, preguntas frecuentes y solución de problemas...",
  "help.settings.subtitle":
    "Acceda a documentos de productos y canales de soporte.",
  "help.settings.topics.locale.description":
    "Las preferencias locales afectan el formato y las cadenas de interfaz traducidas.",
  "help.settings.topics.locale.title":
    "Valores predeterminados de idioma y región",
  "help.settings.topics.retention.description":
    "La retención controla las ventanas de limpieza automática de los datos almacenados.",
  "help.settings.topics.retention.title":
    "Comportamiento de la política de retención",
  "help.settings.topics.theme.description":
    "La configuración de apariencia se aplica por dispositivo y sesión de espacio de trabajo.",
  "help.settings.topics.theme.title":
    "Sincronización de la configuración del tema",
  "help.settings.viewDocs": "Ver documentación",
  "help.title": "Ayuda y Documentación",
  "history.confidence.high": "Alta confianza",
  "history.confidence.low": "Baja confianza",
  "history.confidence.medium": "Confianza media",
  "history.confidence.short.high": "Alta",
  "history.confidence.short.low": "Bajo",
  "history.confidence.short.medium": "Medio",
  "history.confidence.unknown": "Desconocida",
  "history.detail.a11y.collapseSource": "Contraer vista previa de fuente",
  "history.detail.a11y.collapseTimings": "Contraer tiempos",
  "history.detail.a11y.copySource": "Copiar vista previa del código fuente",
  "history.detail.a11y.expandSource": "Ampliar vista previa de fuente",
  "history.detail.a11y.expandTimings": "Ampliar horarios",
  "history.detail.collapse": "Colapsar",
  "history.detail.copy": "Copiar",
  "history.detail.expand": "Expandir",
  "history.detail.export": "Exportar .md",
  "history.detail.language": "Idioma",
  "history.detail.legacy":
    "Este mensaje se guardó antes de que se habilitaran los análisis detallados. Algunas secciones pueden estar vacías.",
  "history.detail.na": "No disponible",
  "history.detail.open": "Abierta",
  "history.detail.section.answer": "Respuesta del asistente",
  "history.detail.section.query": "Consulta de usuario",
  "history.detail.section.retrievalMeta": "Metadatos de recuperación",
  "history.detail.section.runtime": "Parámetros utilizados",
  "history.detail.section.sources": "Fuentes",
  "history.detail.section.timings": "Timings (ms)",
  "history.detail.section.tokens": "Uso de tokens",
  "history.detail.sourceCopied": "Fuente copiada.",
  "history.detail.sourceCopyFailed": "No se pudo copiar la fuente.",
  "history.detail.sourceNoPreview": "No hay vista previa disponible.",
  "history.detail.sourceRelevance": "Pertinencia",
  "history.detail.sourceRelevancePct": "Relevancia {{pct}}%",
  "history.detail.sourcesRelevanceHint":
    "El porcentaje de relevancia es relativo dentro de esta respuesta (clasificación de fuentes), no la confianza general del modelo.",
  "history.detail.subtitle":
    "Instantánea de tiempo de ejecución capturada con esta respuesta.",
  "history.detail.timing.llm": "generación LLM",
  "history.detail.timing.reranking": "Reclasificación",
  "history.detail.timing.retrieval": "Recuperación",
  "history.detail.timing.root": "Ejecución de consultas",
  "history.detail.timing.spansTitle": "{{count}} abarca",
  "history.detail.timing.streaming": "Transmisión",
  "history.detail.title": "Detalles de la consulta",
  "history.empty": "No se encontraron mensajes de chat.",
  "history.error.detailDescription":
    "Es posible que este mensaje haya sido eliminado o que no tengas acceso.",
  "history.error.detailTitle": "No se pudo cargar el mensaje",
  "history.error.loadDescription": "Inténtelo de nuevo en un momento.",
  "history.error.loadTitle": "No se pudo cargar el historial",
  "history.export.a11y.dismiss": "Cerrar menú de exportación",
  "history.export.a11y.format": "Exportar {{format}}",
  "history.export.menu": "Exportar",
  "history.exportDetailedCsv": "CSV detallado",
  "history.exportDetailedJson": "JSON detallado",
  "history.exportListCsv": "Exportar CSV",
  "history.list.openDetails": "Abrir detalles de la consulta",
  "history.listDescription": "Newest first. Open a row for full analytics.",
  "history.listTitle": "Consultas",
  "history.loading": "Cargando…",
  "history.loadMore": "Cargar más",
  "history.responseMs": "{{ms}} ms total",
  "history.searchPlaceholder": "Buscar preguntas o respuestas…",
  "history.session": "Sesión",
  "history.status.greeting_default": "Saludo",
  "history.status.out_of_context": "Fuera de contexto",
  "history.status.privacy_block": "Bloque de privacidad",
  "history.subtitle":
    "Revise las preguntas anteriores del chatbot, los tiempos y los detalles de recuperación de su proyecto activo.",
  "history.tag.failed": "Fallida",
  "history.title": "Historial de chat",
  "history.toast.copied": "Copiada al portapapeles",
  "history.toast.copyFailed": "Copia fallida",
  "history.toast.exportListDone": "Exportar descargado",
  "history.toast.exportListFailed": "Exportación fallida",
  "integrations.credentials.a11y.copyField": "Copiar {{field}}",
  "integrations.credentials.a11y.fieldCopied": "{{field}} copiado",
  "integrations.credentials.apiEndpoint": "Endpoint de API",
  "integrations.credentials.copied": "Copiado al portapapeles",
  "integrations.credentials.embedToken": "Token de incrustación",
  "integrations.credentials.embedTokenUnavailable":
    "Cargue los dominios permitidos para obtener el token de incrustación del proyecto activo",
  "integrations.credentials.manageApiKeys": "Abrir Configuración → Claves API",
  "integrations.credentials.manageDomains": "Administrar dominios permitidos",
  "integrations.credentials.mobile.description":
    "Use una clave API móvil (rgs_live_…) de Configuración → Claves API. No use el token de incrustación web en aplicaciones nativas.",
  "integrations.credentials.mobile.noEmbedToken":
    "No use el token de incrustación web en aplicaciones móviles — cree una clave API en su lugar.",
  "integrations.credentials.mobile.title": "Credenciales del SDK móvil",
  "integrations.credentials.mobileApiKey": "Clave API móvil",
  "integrations.credentials.projectId": "ID del proyecto",
  "integrations.credentials.projectIdPlaceholder":
    "Seleccione un proyecto para cargar su ID de proyecto",
  "integrations.credentials.web.description":
    "Use estos valores para incrustaciones de widgets HTML. El token de incrustación es solo para web — nunca lo incluya en aplicaciones móviles.",
  "integrations.credentials.web.title": "Credenciales de incrustación web",
  "integrations.description":
    "Gestiona tus integraciones de chat y búsqueda de IA en todos los entornos",
  "integrations.section.title": "Integraciones",
  "integrations.section.subtitle":
    "Copie fragmentos de inserción para clientes web y móviles.",
  "integrations.tabs.reactNative": "Mobile",
  "inviteSetup.field.confirmPassword": "Confirma la nueva contraseña",
  "inviteSetup.field.username": "Nombre de usuario",
  "login.2fa.description":
    "Ingresa el código de tu aplicación autenticadora o revisa tu correo electrónico para el código de verificación. Los códigos del autenticador se actualizan cada 30 segundos.",
  "login.2fa.helper":
    "Ingresa el código de 6 dígitos de tu aplicación autenticadora o correo electrónico",
  "login.2fa.resend": "Reenviar código",
  "login.2fa.resending": "Envío...",
  "login.2fa.resendSuccess":
    "Se ha enviado un nuevo código a su correo electrónico.",
  "login.2fa.title": "Código de Autenticación de Dos Factores",
  "login.2fa.verify": "Verificar",
  "login.2fa.verifying": "Verificando...",
  "login.brand.tagline": "Plataforma de IA Empresarial",
  "login.errors.generic": "Algo salió mal. Por favor inténtalo de nuevo.",
  "login.errors.invalid2FACode":
    "Por favor ingresa un código válido de 6 dígitos",
  "login.errors.invalidCredentials":
    "Nombre de usuario o contraseña no válidos.",
  "login.errors.missingCredentials":
    "Por favor ingresa nombre de usuario y contraseña",
  "login.errors.sessionExpired":
    "Tu sesión ha caducado. Por favor inicia sesión nuevamente.",
  "login.features.analytics.description":
    "Rastrea uso, rendimiento y satisfacción del usuario",
  "login.features.analytics.title": "Analíticas Avanzadas",
  "login.features.deployment.description":
    "Publique Search y Assistant mediante widgets integrables",
  "login.features.deployment.title": "Despliegue Rápido",
  "login.features.description":
    "Se ejecuta en su infraestructura. Gestione contenido, conectores y analítica desde un panel.",
  "login.features.security.description":
    "Cumplimiento SOC 2 con permisos avanzados",
  "login.features.security.title": "Seguridad Empresarial",
  "login.features.title": "AI Search, AI Assistant y AI Connectors",
  "login.footer.copyright": "© 2026 RAGSuite. Plataforma de IA Empresarial.",
  "login.form.password.label": "Contraseña",
  "login.form.password.placeholder": "Ingresa tu contraseña",
  "login.form.rememberMe": "Acuérdate de mí",
  "login.form.submit.label": "Iniciar sesión",
  "login.form.submit.loading": "Iniciando sesión...",
  "login.form.username.label": "Nombre de usuario",
  "login.form.username.placeholder": "Ingresa tu nombre de usuario",
  "login.signup.link": "Regístrate",
  "login.signup.mobileLink": "Crear una cuenta",
  "login.signup.prompt": "¿No tienes una cuenta?",
  "login.welcome.mobileSubtitle": "Inicia sesión para continuar",
  "login.welcome.mobileTitle": "Bienvenido a {{orgName}}",
  "login.welcome.subtitle":
    "Inicia sesión para acceder a tu panel de administración",
  "login.welcome.title": "Bienvenido de nuevo",
  "models.apiKey.replaceHelper":
    "Ingrese una nueva clave solo si desea reemplazar la guardada.",
  "models.apiKey.savedHint": "Clave API guardada",
  "models.apiKey.test.a11y": "Probar la conexión de la clave API",
  "models.apiKey.test.button": "Conexión de prueba",
  "models.apiKey.test.connectionFailed": "La conexión falló.",
  "models.apiKey.test.connectionSuccess": "Conexión exitosa.",
  "models.apiKey.test.embedFailed":
    "El chat funciona, pero la inserción falló.",
  "models.apiKey.test.invalidKey":
    "Clave API no válida. Compruebe que la clave coincida con el proveedor seleccionado.",
  "models.apiKey.test.noKey": "Primero ingrese una clave API.",
  "models.apiKey.test.noModel": "Primero seleccione un modelo de chat.",
  "models.apiKey.test.ollama":
    "Ollama se ejecuta localmente, no se necesita clave API.",
  "models.apiKey.test.ollamaNoTest":
    "Ollama se ejecuta localmente; no se requiere prueba de conexión.",
  "models.apiKey.test.success": "Clave API verificada: la conexión funciona.",
  "models.apiKey.test.testing": "Pruebas…",
  "moduleSaveBar.saveChanges": "Guardar cambios",
  "n8n.title": "Integración n8n",
  "nav.analytics": "Analíticas",
  "nav.chatbot-configuration": "Configuración del Chatbot",
  "nav.compare-models": "Comparar Modelos",
  "nav.configuration": "Configuración",
  "nav.crawl": "Rastreo",
  "nav.dashboard": "Panel de Control",
  "nav.documents": "Documentos",
  "nav.feedback": "Comentarios",
  "nav.group.application": "Aplicación",
  "nav.group.management": "Gestión",
  "nav.history": "Historial",
  "nav.integrations": "Integraciones",
  "nav.overview": "Resumen",
  "nav.rag-tuning": "Ajuste RAG",
  "nav.search-configuration": "Configuración de Búsqueda",
  "nav.settings": "Configuración",
  "nav.tab.search": "Búsqueda",
  "notifications.actions.deleteAll": "Eliminar Todo",
  "notifications.actions.deleting": "Eliminando...",
  "notifications.actions.markAllAsRead": "Marcar Todos como Leídos",
  "notifications.actions.marking": "Marcando...",
  "notifications.actions.view": "Ver",
  "notifications.description":
    "Alertas del sistema, actualizaciones y notificaciones importantes",
  "notifications.detail.details": "Detalles",
  "notifications.detail.message": "Mensaje",
  "notifications.detail.notAvailable": "N/D",
  "notifications.empty": "No se encontraron notificaciones",
  "notifications.error.loadFailed": "Error al cargar notificaciones",
  "notifications.error.retry": "Reintentar",
  "notifications.filters.status.all": "Todos",
  "notifications.filters.status.placeholder": "Estado",
  "notifications.filters.status.read": "Leídos",
  "notifications.filters.status.unread": "No leídos",
  "notifications.filters.type.all": "Todos los Tipos",
  "notifications.filters.type.info": "Información",
  "notifications.filters.type.placeholder": "Tipo",
  "notifications.filters.type.success": "Éxito",
  "notifications.filters.type.warning": "Advertencia",
  "notifications.loading": "Cargando notificaciones...",
  "notifications.title": "Notificaciones",
  "notifications.toast.error.deleteAllFailed":
    "Error al eliminar todas las notificaciones",
  "notifications.toast.error.deleteFailed": "Error al eliminar la notificación",
  "notifications.toast.error.markAllReadFailed":
    "Error al marcar todas como leídas",
  "notifications.toast.error.markReadFailed":
    "Error al marcar la notificación como leída",
  "notifications.toast.success.deleted": "Notificación eliminada",
  "notifications.toast.success.deletedAll":
    "Todas las notificaciones eliminadas",
  "notifications.toast.success.markAllRead":
    "Todas las notificaciones marcadas como leídas",
  "notifications.toast.success.title": "Éxito",
  "notion.refresh": "Actualizar",
  "notion.sources.search": "Buscar",
  "onboarding.actions.completing": "Completando...",
  "onboarding.actions.finish": "Finalizar configuración",
  "onboarding.actions.processing": "Procesando...",
  "onboarding.branding.logo.change": "Cambiar logo",
  "onboarding.branding.logo.label": "Subir logo (opcional)",
  "onboarding.branding.logo.remove": "Eliminar logo",
  "onboarding.branding.logo.upload": "Subir logo",
  "onboarding.branding.orgName.label": "Nombre de la organización",
  "onboarding.branding.orgName.placeholder":
    "Ingresa el nombre de tu organización",
  "onboarding.branding.primaryColor.label": "Color primario",
  "onboarding.branding.themePresets.label": "Preajustes de tema",
  "onboarding.crawl.inProgress.description":
    "Espera a que el rastreo termine antes de continuar.",
  "onboarding.crawl.inProgress.title": "Rastreo en progreso",
  "onboarding.dataSource.actions.crawling": "Rastreando...",
  "onboarding.dataSource.actions.creating": "Creando...",
  "onboarding.dataSource.actions.skip": "Omitir por ahora",
  "onboarding.dataSource.actions.startCrawl": "Iniciar rastreo",
  "onboarding.dataSource.cadence.daily": "Diario (recomendado)",
  "onboarding.dataSource.cadence.label": "Frecuencia de rastreo",
  "onboarding.dataSource.cadence.once": "Una vez",
  "onboarding.dataSource.cadence.weekly": "Semanal",
  "onboarding.dataSource.depth.label": "Profundidad de rastreo",
  "onboarding.dataSource.depth.option0": "Solo esta página",
  "onboarding.dataSource.depth.option1":
    "1 nivel (URL inicial + páginas enlazadas)",
  "onboarding.dataSource.depth.option2": "2 niveles (recomendado)",
  "onboarding.dataSource.depth.option3": "3 niveles",
  "onboarding.dataSource.depth.option4": "4 niveles",
  "onboarding.dataSource.depth.option5": "5 niveles (rastreo profundo)",
  "onboarding.dataSource.headless.helper":
    "Habilitar para sitios con mucho JavaScript",
  "onboarding.dataSource.headless.label": "Modo de navegador sin cabeza",
  "onboarding.dataSource.invalid.addNew": "Agregar nuevo sitio web",
  "onboarding.dataSource.invalid.description":
    "La URL que ingresaste es inválida. Ingresa una URL válida e inténtalo de nuevo.",
  "onboarding.dataSource.invalid.title": "URL inválida",
  "onboarding.dataSource.progress.description":
    "Espera mientras rastreamos tu sitio web. Podrás pasar al siguiente paso cuando termine.",
  "onboarding.dataSource.progress.title": "Rastreo en progreso...",
  "onboarding.dataSource.status.label": "Estado: {{status}}",
  "onboarding.dataSource.success.description":
    'Ahora puedes continuar al siguiente paso haciendo clic en el botón "Siguiente".',
  "onboarding.dataSource.success.title": "Rastreo completado correctamente.",
  "onboarding.dataSource.url.helper":
    "Introduce la URL de tu documentación o sitio de contenido",
  "onboarding.dataSource.url.label": "URL del sitio web",
  "onboarding.errors.projectRequired":
    "No hay un proyecto disponible. Vuelve atrás y crea un proyecto primero.",
  "onboarding.errors.startCrawlFailed":
    "No se pudo iniciar el rastreo. Inténtalo de nuevo.",
  "onboarding.errors.urlRequired":
    "Por favor ingresa una URL de sitio web primero",
  "onboarding.header.subtitle":
    "Configure AI Search, AI Assistant y AI Connectors en pocos pasos",
  "onboarding.header.title": "Bienvenido a {{brand}}",
  "onboarding.loading.status": "Cargando estado de incorporación...",
  "onboarding.preview.branding.description":
    "Así se verá tu branding en la interfaz de administración y en el widget embebible.",
  "onboarding.preview.branding.orgNamePlaceholder": "Tu organización",
  "onboarding.preview.crawl.depthLabel": "Profundidad:",
  "onboarding.preview.crawl.depthValue": "{{count}} niveles",
  "onboarding.preview.crawl.frequencyLabel": "Frecuencia:",
  "onboarding.preview.crawl.headless.disabled": "Deshabilitado",
  "onboarding.preview.crawl.headless.enabled": "Habilitado",
  "onboarding.preview.crawl.headlessLabel": "Sin cabeza:",
  "onboarding.preview.crawl.title": "Configuración de rastreo",
  "onboarding.preview.primaryButton": "Botón primario",
  "onboarding.preview.project.activeBadge": "Este será tu proyecto activo",
  "onboarding.preview.project.descriptionLabel": "Descripción:",
  "onboarding.preview.project.descriptionPlaceholder":
    "La descripción del proyecto aparecerá aquí",
  "onboarding.preview.project.nameLabel": "Nombre del proyecto:",
  "onboarding.preview.project.namePlaceholder": "Nombre de tu proyecto",
  "onboarding.preview.project.title": "Vista previa del proyecto",
  "onboarding.preview.status.aiModelReady": "Modelo de IA listo",
  "onboarding.preview.status.dataSourceAdded": "Fuente de datos añadida",
  "onboarding.preview.status.orgConfigured": "Organización configurada",
  "onboarding.preview.status.projectCreated": "Proyecto creado",
  "onboarding.preview.status.title": "Estado del sistema",
  "onboarding.preview.status.vectorDbReady":
    "Base de datos vectorial inicializada",
  "onboarding.preview.title": "Vista previa en vivo",
  "onboarding.project.description.counter": "{{count}} / {{max}} caracteres",
  "onboarding.project.description.errorTooLong":
    "La descripción del proyecto debe tener {{max}} caracteres o menos. Actual: {{count}} caracteres.",
  "onboarding.project.description.helper":
    "Proporciona una breve descripción de tu proyecto",
  "onboarding.project.description.label": "Descripción del proyecto",
  "onboarding.project.description.limitExceeded": "(Límite excedido)",
  "onboarding.project.description.placeholder":
    "Describe para qué es este proyecto...",
  "onboarding.project.name.helper": "Dale a tu proyecto un nombre descriptivo",
  "onboarding.project.name.label": "Nombre del proyecto",
  "onboarding.project.name.placeholder": "Mi primer proyecto",
  "onboarding.step.label": "Paso {{step}}: {{title}}",
  "onboarding.steps.branding.description": "Personaliza tu organización",
  "onboarding.steps.branding.title": "Herrada",
  "onboarding.steps.dataSource.description":
    "Agrega tu primera fuente de contenido",
  "onboarding.steps.dataSource.title": "Fuente de datos",
  "onboarding.steps.project.description": "Configura tu primer proyecto",
  "onboarding.steps.project.title": "Crear proyecto",
  "onboarding.steps.test.description": "Prueba tu sistema RAG",
  "onboarding.steps.test.title": "Prueba rápida",
  "onboarding.test.errorResponse":
    "Lo siento, no pude procesar tu consulta. Inténtalo de nuevo.",
  "onboarding.test.examples.four": "¿Cuáles son los requisitos del sistema?",
  "onboarding.test.examples.one": "¿Cómo empiezo?",
  "onboarding.test.examples.three": "¿Cómo configurar la autenticación?",
  "onboarding.test.examples.two": "¿Cuáles son los endpoints de la API?",
  "onboarding.test.helper":
    "Haz una pregunta para ver cómo responderá tu asistente de IA usando tu fuente de datos configurada.",
  "onboarding.test.noResponse": "No se recibió respuesta",
  "onboarding.test.placeholder": "Pregunta sobre tu documentación...",
  "onboarding.test.processing": "Procesando tu consulta...",
  "onboarding.test.responseLabel": "Respuesta de IA:",
  "onboarding.test.title": "Prueba tu sistema RAG",
  "org.members.col.actions": "Acciones",
  "org.members.col.user": "Usuario",
  "org.members.field.username": "Nombre de usuario",
  "org.members.role.orgAdmin": "Administrador",
  "org.members.status.active": "Activo",
  "org.members.status.inactive": "Inactivo",
  "org.members.title": "Miembros del equipo",
  "org.permissions.chatbot.integrations": "Integraciones",
  "org.permissions.chatbot.settings": "Configuración",
  "org.permissions.crawl.documents": "Documentos",
  "org.permissions.modules.analytics": "Analíticas",
  "org.permissions.modules.crawl": "Rastreo",
  "org.permissions.modules.feedback": "Comentarios",
  "org.permissions.modules.history": "Historial",
  "org.permissions.modules.profile": "Mi perfil",
  "org.permissions.modules.search": "Buscar",
  "org.permissions.modules.settings": "Configuración",
  "org.permissions.profile.security": "Seguridad",
  "org.permissions.search.integrations": "Integraciones",
  "org.permissions.search.settings": "Configuración",
  "org.permissions.settings.i18n": "Internacionalización",
  "org.sso.subtitle":
    "Configure SSO de Google (OIDC) para usuarios invitados. El aprovisionamiento JIT está desactivado.",
  "org.sso.title": "Inicio de sesión con Google",
  "org.tabs.overview": "Resumen",
  "overview.chart.noData": "No hay datos disponibles",
  "overview.chart.queriesOverTime.title": "Consultas a lo Largo del Tiempo",
  "overview.description":
    "Monitorea el rendimiento de tu sistema RAG y el compromiso del usuario",
  "overview.errors.loadFailed": "Error al cargar datos de resumen",
  "overview.errors.loadingError": "Error al cargar resumen",
  "overview.feedback.down": "No me gusta",
  "overview.feedback.notAvailable": "No hay comentarios disponibles",
  "overview.feedback.title": "Últimos Comentarios",
  "overview.feedback.up": "Me gusta",
  "overview.refresh.error.description":
    "Error al actualizar los datos del resumen. Por favor intenta de nuevo.",
  "overview.refresh.error.title": "Error al Actualizar",
  "overview.refresh.success.description":
    "Los datos del resumen han sido actualizados.",
  "overview.refresh.success.title": "Datos Actualizados",
  "overview.sources.docs": "{{count}} documentos",
  "overview.sources.errorBadgePlural": "{{count}} errores",
  "overview.sources.errors": "{{count}} errores",
  "overview.sources.lastCrawl": "Último rastreo:",
  "overview.sources.neverCrawled": "Nunca rastreado",
  "overview.sources.notFound": "No se encontraron fuentes de rastreo",
  "overview.sources.title": "Principales Fuentes de Rastreo",
  "overview.sources.zeroDocs": "0 documentos",
  "overview.stats.p95Latency.description": "tiempo promedio de respuesta",
  "overview.stats.p95Latency.title": "Latencia p95",
  "overview.stats.queriesToday.fromToday": "desde hoy",
  "overview.stats.queriesToday.fromYesterday": "desde ayer",
  "overview.stats.queriesToday.title": "Consultas Hoy",
  "overview.stats.thumbsUpRate.description": "satisfacción del usuario",
  "overview.stats.thumbsUpRate.title": "Tasa de Pulgares Arriba",
  "overview.stats.tokenUsage.description": "tokens totales usados",
  "overview.stats.tokenUsage.notReported": "no reportado por API",
  "overview.stats.tokenUsage.title": "Uso de Tokens",
  "overview.time.dayAgo": "hace 1 día",
  "overview.time.daysAgo": "hace {{count}} días",
  "overview.time.hourAgo": "hace 1 hora",
  "overview.time.hoursAgo": "hace {{count}} horas",
  "overview.time.justNow": "Ahora mismo",
  "overview.time.minuteAgo": "hace 1 min",
  "overview.time.minutesAgo": "hace {{count}} mins",
  "overview.time.unknown": "Desconocido",
  "profile.actions.save": "Guardar cambios",
  "profile.actions.saving": "Guardando...",
  "profile.actions.updatePassword": "Actualizar contraseña",
  "profile.actions.updatingPassword": "Actualizando...",
  "profile.avatar.updateLabel": "Actualizar avatar",
  "profile.badge.admin": "Administrador",
  "profile.badge.user": "Usuario",
  "profile.defaultUser": "Usuario",
  "profile.departments.design": "Diseño",
  "profile.departments.engineering": "Ingeniería",
  "profile.departments.operations": "Operaciones",
  "profile.departments.product": "Producto",
  "profile.departments.sales": "Ventas",
  "profile.dialogs.backupCodes.copied": "Copiada",
  "profile.dialogs.backupCodes.copy": "Copiar",
  "profile.dialogs.backupCodes.description":
    "Guarda estos códigos de forma segura. Se pueden usar para acceder a tu cuenta si pierdes tu dispositivo autenticador.",
  "profile.dialogs.backupCodes.notice":
    "Estos códigos solo se mostrarán una vez. Asegúrate de guardarlos en un lugar seguro.",
  "profile.dialogs.backupCodes.saved": "Ya guardé estos códigos",
  "profile.dialogs.backupCodes.title": "Códigos de respaldo",
  "profile.dialogs.disable2fa.codeHelper":
    "O usa un código de respaldo si no tienes acceso a tu autenticador",
  "profile.dialogs.disable2fa.codeLabel": "Código 2FA",
  "profile.dialogs.disable2fa.description":
    "Ingresa tu contraseña y código 2FA para deshabilitar la autenticación de dos factores",
  "profile.dialogs.disable2fa.disable": "Deshabilitar 2FA",
  "profile.dialogs.disable2fa.disabling": "Deshabilitando...",
  "profile.dialogs.disable2fa.passwordLabel": "Contraseña",
  "profile.dialogs.disable2fa.passwordPlaceholder": "Ingresa tu contraseña",
  "profile.dialogs.disable2fa.title":
    "Deshabilitar autenticación de dos factores",
  "profile.dialogs.email2fa.disableDescription":
    "Ingresa tu contraseña para deshabilitar la autenticación de dos factores por correo.",
  "profile.dialogs.email2fa.disableTitle": "Deshabilitar 2FA por correo",
  "profile.dialogs.email2fa.enableDescription":
    "Ingresa tu contraseña para habilitar la autenticación de dos factores por correo. Recibirás códigos de verificación por correo al iniciar sesión.",
  "profile.dialogs.email2fa.enableTitle": "Habilitar 2FA por correo",
  "profile.dialogs.email2fa.passwordLabel": "Contraseña",
  "profile.dialogs.email2fa.passwordPlaceholder": "Ingresa tu contraseña",
  "profile.dialogs.setup2fa.description":
    "Escanea el código QR con tu app de autenticación",
  "profile.dialogs.setup2fa.title": "Configurar autenticación de dos factores",
  "profile.dialogs.setup2fa.verify": "Verificar",
  "profile.dialogs.verify2fa.codeLabel": "Código de verificación",
  "profile.dialogs.verify2fa.description":
    "Ingresa el código de 6 dígitos de tu app de autenticación",
  "profile.dialogs.verify2fa.title": "Verificar autenticación de dos factores",
  "profile.dialogs.verify2fa.verifyAndEnable": "Verificar y habilitar",
  "profile.dialogs.verify2fa.verifying": "Verificando...",
  "profile.errors.loadFailed":
    "Los datos del perfil no están disponibles en este momento.",
  "profile.errors.securityActionFailed": "La acción de seguridad falló.",
  "profile.fields.bio": "Biografía",
  "profile.fields.bioPlaceholder": "Cuéntanos sobre ti...",
  "profile.fields.confirmPassword": "Confirmar nueva contraseña",
  "profile.fields.confirmPasswordPlaceholder": "Confirma la nueva contraseña",
  "profile.fields.currentPassword": "Contraseña actual",
  "profile.fields.currentPasswordPlaceholder": "Ingresa la contraseña actual",
  "profile.fields.department": "Departamento",
  "profile.fields.departmentPlaceholder": "Seleccionar departamento",
  "profile.fields.email": "Correo electrónico",
  "profile.fields.emailLocked": "La dirección de correo no se puede cambiar",
  "profile.fields.emailLockedTitle": "El correo no se puede cambiar",
  "profile.fields.jobTitle": "Puesto",
  "profile.fields.jobTitlePlaceholder": "Ingresa tu puesto",
  "profile.fields.location": "Ubicación",
  "profile.fields.newPassword": "Nueva contraseña",
  "profile.fields.newPasswordPlaceholder": "Ingresa la nueva contraseña",
  "profile.fields.phone": "Número de teléfono",
  "profile.fields.phonePlaceholder": "Ingresa tu número de teléfono",
  "profile.fields.timezone": "Zona horaria",
  "profile.fields.timezonePlaceholder": "Seleccionar zona horaria",
  "profile.fields.username": "Nombre de usuario",
  "profile.sections.contact.description":
    "Gestiona tus datos de contacto y zona horaria",
  "profile.sections.contact.title": "Contacto y ubicación",
  "profile.sections.personal.description":
    "Actualiza tus datos personales e información de contacto",
  "profile.sections.personal.title": "Información personal",
  "profile.sections.security.options.description":
    "Opciones de seguridad adicionales para tu cuenta",
  "profile.sections.security.options.title": "Configuración de seguridad",
  "profile.sections.security.password.description":
    "Gestiona tu contraseña y la autenticación de dos factores",
  "profile.sections.security.password.title": "Contraseña y autenticación",
  "profile.security.email2fa.disabled":
    "Recibe códigos 2FA por correo en lugar de usar una app de autenticación",
  "profile.security.email2fa.enabled":
    "La 2FA por correo está habilitada. Recibirás códigos por correo al iniciar sesión.",
  "profile.security.email2fa.processing": "Procesando...",
  "profile.security.email2fa.title": "Autenticación de dos factores por correo",
  "profile.security.loginNotifications.description":
    "Recibe notificaciones de nuevos inicios de sesión",
  "profile.security.loginNotifications.title":
    "Notificaciones de inicio de sesión",
  "profile.security.sessions.description": "Gestiona las sesiones activas",
  "profile.security.sessions.title": "Gestión de sesiones",
  "profile.security.sessions.view": "Ver sesiones",
  "profile.security.totp.backupCodes": "Códigos de respaldo",
  "profile.security.totp.disable": "Desactivar",
  "profile.security.totp.disabled":
    "Agrega una capa extra de seguridad con una app de autenticación",
  "profile.security.totp.enable": "Activar",
  "profile.security.totp.enabled": "La 2FA TOTP está habilitada para tu cuenta",
  "profile.security.totp.generating": "Generando...",
  "profile.security.totp.settingUp": "Configurando...",
  "profile.security.totp.title": "Autenticación de dos factores (TOTP)",
  "profile.sessions.close": "Cerca",
  "profile.sessions.confirmRevokeAction": "Revocar sesión",
  "profile.sessions.confirmRevokeAllAction": "Revocar todas las sesiones",
  "profile.sessions.confirmRevokeAllCount":
    "{{count}} sesiones serán revocadas",
  "profile.sessions.confirmRevokeAllDescription":
    "¿Está seguro de que desea revocar todas las demás sesiones activas? Esto cerrará la sesión de todos los usuarios de otros dispositivos inmediatamente.",
  "profile.sessions.confirmRevokeAllTitle":
    "¿Revocar todas las demás sesiones?",
  "profile.sessions.confirmRevokeDescription":
    "¿Está seguro de que desea revocar esta sesión? El usuario cerrará sesión en este dispositivo inmediatamente.",
  "profile.sessions.confirmRevokeTitle": "¿Revocar sesión?",
  "profile.sessions.currentBadge": "Activa",
  "profile.sessions.currentDescription": "Esta es tu sesión activa actual",
  "profile.sessions.currentTitle": "Sesión actual",
  "profile.sessions.description":
    "Administre sus sesiones de inicio de sesión activas. Puede revocar cualquier sesión para forzar el cierre de sesión en ese dispositivo.",
  "profile.sessions.lastActive": "Última activa",
  "profile.sessions.loadFailed": "No se pudieron cargar las sesiones",
  "profile.sessions.loadFailedHint": "Por favor inténtalo de nuevo",
  "profile.sessions.loading": "Cargando sesiones...",
  "profile.sessions.loggedIn": "Iniciado sesión",
  "profile.sessions.noneFound": "No se encontraron sesiones activas",
  "profile.sessions.noOtherSessions": "No hay otras sesiones activas",
  "profile.sessions.onlyThisDevice":
    "Solo has iniciado sesión en este dispositivo",
  "profile.sessions.otherDescription":
    "{{count}} sesiones activas en otros dispositivos",
  "profile.sessions.otherTitle": "Otras sesiones activas",
  "profile.sessions.revoke": "Revocar",
  "profile.sessions.revokeAll": "Revocar todo",
  "profile.sessions.revoking": "Revocando...",
  "profile.sessions.title": "Sesiones activas",
  "profile.subtitle": "Administra la configuración y preferencias de tu cuenta",
  "profile.summary.joined": "Se unió {{date}}",
  "profile.summary.unknownDate": "Desconocida",
  "profile.tabs.security": "Seguridad",
  "profile.timezones.central": "Hora Central (CT)",
  "profile.timezones.cet": "Hora de Europa Central (CET)",
  "profile.timezones.eastern": "Hora del Este (ET)",
  "profile.timezones.gmt": "Hora del Meridiano de Greenwich (GMT)",
  "profile.timezones.mountain": "Hora de la Montaña (MT)",
  "profile.timezones.pacific": "Hora del Pacífico (PT)",
  "profile.title": "Mi perfil",
  "profile.toast.2fa.disabled.description":
    "La autenticación de dos factores se ha deshabilitado.",
  "profile.toast.2fa.disabled.title": "2FA deshabilitada",
  "profile.toast.2fa.disableFailed":
    "No se pudo deshabilitar la 2FA. Verifica tu contraseña y código.",
  "profile.toast.2fa.enabled.description":
    "La autenticación de dos factores se ha habilitado para tu cuenta.",
  "profile.toast.2fa.enabled.title": "2FA habilitada",
  "profile.toast.2fa.setupFailed":
    "No se pudo configurar la 2FA. Por favor intenta de nuevo.",
  "profile.toast.2fa.setupStarted.description":
    "Escanea el código QR e ingresa el código de verificación.",
  "profile.toast.2fa.setupStarted.title": "Configuración de 2FA iniciada",
  "profile.toast.2fa.verifyFailed.description":
    "Código inválido. Por favor intenta de nuevo.",
  "profile.toast.2fa.verifyFailed.title": "Verificación fallida",
  "profile.toast.avatarUpdated": "Avatar actualizado.",
  "profile.toast.backupCodes.description":
    "Se generaron nuevos códigos de respaldo. Guárdalos de forma segura.",
  "profile.toast.backupCodes.title": "Códigos de respaldo generados",
  "profile.toast.backupCodesFailed":
    "No se pudieron regenerar los códigos de respaldo.",
  "profile.toast.codeRequired.description": "Por favor ingresa tu código 2FA.",
  "profile.toast.codeRequired.title": "Código requerido",
  "profile.toast.copied.description":
    "Código de respaldo copiado al portapapeles.",
  "profile.toast.copied.title": "Copiado",
  "profile.toast.email2fa.disabled.description":
    "La autenticación de dos factores por correo se ha deshabilitado.",
  "profile.toast.email2fa.disabled.title": "2FA por correo deshabilitada",
  "profile.toast.email2fa.disableFailed":
    "No se pudo deshabilitar la 2FA por correo. Por favor intenta de nuevo.",
  "profile.toast.email2fa.enabled.description":
    "La autenticación de dos factores por correo se ha habilitado. Recibirás códigos por correo al iniciar sesión.",
  "profile.toast.email2fa.enabled.title": "2FA por correo habilitada",
  "profile.toast.email2fa.enableFailed":
    "No se pudo habilitar la 2FA por correo. Por favor intenta de nuevo.",
  "profile.toast.fileTooLarge.description":
    "Selecciona una imagen menor a 5MB.",
  "profile.toast.fileTooLarge.title": "Archivo demasiado grande",
  "profile.toast.invalidCode.description":
    "Por favor ingresa un código de 6 dígitos.",
  "profile.toast.invalidCode.title": "Código inválido",
  "profile.toast.invalidFileType.description":
    "Selecciona un archivo de imagen.",
  "profile.toast.invalidFileType.title": "Tipo de archivo inválido",
  "profile.toast.passwordMismatch":
    "La nueva contraseña y la confirmación no coinciden.",
  "profile.toast.passwordRequired.description":
    "Por favor ingresa tu contraseña.",
  "profile.toast.passwordRequired.title": "Contraseña requerida",
  "profile.toast.passwordTooShort":
    "La contraseña debe tener al menos 8 caracteres.",
  "profile.toast.passwordUpdated.description":
    "Tu contraseña se ha cambiado correctamente.",
  "profile.toast.passwordUpdated.title": "Contraseña actualizada",
  "profile.toast.passwordUpdateFailed":
    "No se pudo actualizar la contraseña. Verifica tu contraseña actual.",
  "profile.toast.readFileError.description":
    "No se pudo leer el archivo de imagen.",
  "profile.toast.sessions.revoked": "Sesión revocada.",
  "profile.toast.sessions.revokedOthers": "Otras sesiones revocadas.",
  "profile.toast.updateFailed":
    "No se pudo actualizar el perfil. Por favor intenta de nuevo.",
  "profile.toast.updateSuccess.description":
    "Tu perfil se ha actualizado correctamente.",
  "profile.toast.updateSuccess.title": "Perfil actualizado",
  "projects.actions.clearFilters": "Limpiar filtros",
  "projects.actions.create": "Crear proyecto",
  "projects.actions.creating": "Creando...",
  "projects.actions.deleting": "Eliminando...",
  "projects.actions.update": "Actualizar proyecto",
  "projects.actions.updating": "Actualizando...",
  "projects.date.unknown": "Desconocido",
  "projects.dialog.create.description":
    "Crea un nuevo proyecto para organizar tu documentación y fuentes de contenido.",
  "projects.dialog.create.title": "Crear nuevo proyecto",
  "projects.dialog.delete.description":
    '¿Seguro que deseas eliminar "{{name}}"? Esta acción no se puede deshacer.',
  "projects.dialog.delete.title": "Eliminar proyecto",
  "projects.dialog.edit.description":
    "Actualiza los detalles del proyecto a continuación.",
  "projects.dialog.edit.title": "Editar proyecto",
  "projects.dropdown.createNew": "Crear nuevo proyecto",
  "projects.dropdown.loadingSubtitle": "Por favor espera",
  "projects.dropdown.loadingTitle": "Cargando...",
  "projects.dropdown.noProjectDescription": "Crea un proyecto para comenzar",
  "projects.dropdown.noProjectTitle": "Sin proyecto",
  "projects.dropdown.switchLabel": "Cambiar proyecto",
  "projects.dropdown.viewAll": "Ver todos los proyectos",
  "projects.empty.default": "No se encontraron proyectos",
  "projects.empty.filtered":
    "No se encontraron proyectos que coincidan con tus filtros",
  "projects.error.cannotDeleteActive.description":
    "Cambia a otro proyecto antes de eliminar este.",
  "projects.error.cannotDeleteActive.title":
    "No se puede eliminar el proyecto activo",
  "projects.error.createFailed":
    "No se pudo crear el proyecto. Por favor intenta de nuevo.",
  "projects.error.deleteFailed":
    "No se pudo eliminar el proyecto. Por favor intenta de nuevo.",
  "projects.error.descriptionRequired":
    "La descripción del proyecto es obligatoria",
  "projects.error.descriptionTooLong":
    "La descripción del proyecto debe tener {{max}} caracteres o menos. Actual: {{count}} caracteres.",
  "projects.error.loadFailed": "Error al cargar los proyectos",
  "projects.error.nameRequired": "El nombre del proyecto es obligatorio",
  "projects.error.switchFailed":
    "No se pudo cambiar de proyecto. Por favor intenta de nuevo.",
  "projects.error.updateFailed":
    "No se pudo actualizar el proyecto. Por favor intenta de nuevo.",
  "projects.filters.sort.nameAsc": "Nombre (A-Z)",
  "projects.filters.sort.nameDesc": "Nombre (Z-A)",
  "projects.filters.sort.newest": "Más recientes primero",
  "projects.filters.sort.oldest": "Más antiguos primero",
  "projects.filters.sort.placeholder": "Ordenar por",
  "projects.filters.status.active": "Activo",
  "projects.filters.status.all": "Todos los estados",
  "projects.filters.status.inactive": "Inactivo",
  "projects.filters.status.placeholder": "Estado",
  "projects.form.description.count": "{{count}} / {{max}} caracteres",
  "projects.form.description.label": "Descripción",
  "projects.form.description.limitExceeded": "Límite excedido",
  "projects.form.description.placeholder": "Describe este proyecto...",
  "projects.form.name.label": "Nombre del proyecto",
  "projects.form.name.placeholder": "p. ej., Documentos de marketing",
  "projects.list.created": "Creado {{date}}",
  "projects.loading": "Cargando proyectos...",
  "projects.search.placeholder": "Buscar proyectos...",
  "projects.subtitle":
    "Gestiona y cambia entre todos tus proyectos ({{count}} en total)",
  "projects.switch.a11y.current": "Proyecto actual: {{name}}",
  "projects.switch.a11y.trigger": "Cambiar proyecto",
  "projects.switch.subtitle": "Elija un proyecto para trabajar.",
  "projects.switch.title": "Cambiar proyecto",
  "projects.title": "Todos los proyectos",
  "projects.toast.created.description": '"{{name}}" se ha creado correctamente',
  "projects.toast.created.title": "Proyecto creado",
  "projects.toast.deleted.description":
    '"{{name}}" se ha eliminado correctamente',
  "projects.toast.deleted.title": "Proyecto eliminado",
  "projects.toast.updated.description":
    '"{{name}}" se ha actualizado correctamente',
  "projects.toast.updated.title": "Proyecto actualizado",
  "rag-tuning.description":
    "Prueba y optimiza la configuración de generación aumentada por recuperación",
  "rag-tuning.title": "Playground de Ajuste RAG",
  "resetPassword.field.confirmPassword": "Confirma la nueva contraseña",
  "resetPassword.field.confirmPasswordPlaceholder":
    "Confirma la nueva contraseña",
  "resetPassword.field.newPasswordPlaceholder": "Ingresa la nueva contraseña",
  "resetPassword.field.username": "Nombre de usuario",
  "search.citations.colours.accent": "Acento",
  "search.citations.colours.default": "Predeterminado",
  "search.citations.colours.helper": "Tema de color de las citas",
  "search.citations.colours.label": "Esquema de color",
  "search.citations.colours.muted": "Atenuado",
  "search.citations.colours.primary": "Primario",
  "search.citations.description":
    "Configura cómo se muestran las citas en las respuestas de búsqueda",
  "search.citations.displayOptions.showSnippets": "Mostrar fragmentos",
  "search.citations.displayOptions.showSnippetsHelper":
    "Mostrar fragmentos de contenido",
  "search.citations.displayOptions.showSourceCount":
    "Mostrar recuento de fuentes",
  "search.citations.displayOptions.showSourceCountHelper":
    "Mostrar el número de fuentes",
  "search.citations.displayOptions.showUrls": "Mostrar URLs",
  "search.citations.displayOptions.showUrlsHelper": "Mostrar enlaces de origen",
  "search.citations.displayOptions.title": "Opciones de visualización",
  "search.citations.empty": "No hay ajustes de citas disponibles",
  "search.citations.layout.grid": "Cuadrícula",
  "search.citations.layout.helper": "Cómo se organizan las citas",
  "search.citations.layout.label": "Diseño",
  "search.citations.loading": "Cargando ajustes de citas...",
  "search.citations.numbering.helper": "Cómo se numeran las citas",
  "search.citations.numbering.label": "Estilo de numeración",
  "search.citations.preview.label": "Vista previa:",
  "search.citations.preview.text":
    "Este es un fragmento de cita de ejemplo que muestra cómo se truncará el texto cuando supere la longitud máxima establecida. ",
  "search.citations.reset": "Restablecer",
  "search.citations.reset.a11y": "Restablecer el formato de la cita",
  "search.citations.save": "Guardar cambios",
  "search.citations.save.a11y": "Guardar cambios de formato de citas",
  "search.citations.snippetLength.helper":
    "Longitud máxima de los fragmentos de contenido",
  "search.citations.snippetLength.label": "Longitud máxima de fragmento",
  "search.citations.snippetLength.value": "{{count}} caracteres",
  "search.citations.style.card": "Tarjeta",
  "search.citations.style.compact": "Compacto",
  "search.citations.style.detailed": "Detallado",
  "search.citations.style.helper": "Elige cómo se muestran las citas",
  "search.citations.style.label": "Estilo de citas",
  "search.citations.style.minimal": "Mínimo",
  "search.citations.title": "Formato de citas",
  "search.citations.unavailable":
    "La configuración de citas no está disponible.",
  "search.config.backgroundLabel": "Fondo",
  "search.config.borderRadius.mediumRounded": "Medio redondeado",
  "search.config.borderRadius.rounded": "Redondeado",
  "search.config.borderRadius.semiRounded": "Semi redondeado",
  "search.config.borderRadius.square": "Cuadrado",
  "search.config.borderRadiusLabel": "Radio de borde",
  "search.config.description":
    "Configura los ajustes y la apariencia de tu cuadro de búsqueda",
  "search.config.feedbackEnabled.description":
    "Si está desactivado, el widget de búsqueda oculta los controles de comentarios y no guarda nuevos comentarios.",
  "search.config.feedbackEnabled.label": "Recopilar comentarios de usuarios",
  "search.config.icon.error":
    "El icono de búsqueda solo funciona cuando el tipo de formulario está en 'Predeterminado'",
  "search.config.icon.pickerTitle": "Icono de búsqueda",
  "search.config.icon.scan": "Escanear",
  "search.config.icon.search": "Buscar",
  "search.config.icon.sparkles": "Destellos",
  "search.config.iconLabel": "Icono de búsqueda",
  "search.config.languageLabel": "Idioma",
  "search.config.loader.skeleton": "Esqueleto",
  "search.config.loader.typing": "Indicador de escritura",
  "search.config.loaderLabel": "Seleccionar cargador",
  "search.config.loading": "Cargando configuración...",
  "search.config.save": "Guardar configuración",
  "search.config.saving": "Ahorro...",
  "search.config.styleCustom": "Personalizar estilo",
  "search.config.styleDefault": "Predeterminado",
  "search.config.styleHelper":
    "Selecciona el estilo del cuadro de búsqueda y resultados (el estilo predeterminado coincide con el esquema de colores del sitio)",
  "search.config.styleLabel": "Seleccionar estilo",
  "search.config.title": "Configuración del cuadro de búsqueda",
  "search.config.titleLabel": "Título",
  "search.config.titlePlaceholder": "Cuadro de búsqueda",
  "search.config.toast.saved.description":
    "La configuración del cuadro de búsqueda se guardó correctamente.",
  "search.config.toast.saved.title": "Configuración guardada",
  "search.config.toast.saveError":
    "No se pudo guardar la configuración de búsqueda. Inténtalo de nuevo.",
  "search.config.unavailable":
    "La configuración del cuadro de búsqueda no está disponible.",
  "search.customisation.buttonText.default": "Buscar",
  "search.customisation.buttonText.label": "Texto del botón de búsqueda",
  "search.customisation.buttonText.placeholder": "Buscar",
  "search.customisation.buttonType.error":
    "El tipo de botón solo funciona cuando el tipo de formulario está en 'Con botón'",
  "search.customisation.buttonType.icon": "Icono de búsqueda",
  "search.customisation.buttonType.label": "Tipo de botón",
  "search.customisation.buttonType.withLabel": "Con etiqueta",
  "search.customisation.description":
    "Personaliza el formulario y el comportamiento del cuadro de búsqueda",
  "search.customisation.formType.default": "Predeterminado",
  "search.customisation.formType.label": "Tipo de formulario de búsqueda",
  "search.customisation.formType.withButton": "Con botón",
  "search.customisation.inputPlaceholder.label":
    "Marcador de posición del buscador",
  "search.customisation.inputPlaceholder.placeholder": "Busca con IA...",
  "search.customisation.loading": "Cargando personalización...",
  "search.customisation.recentSearch.helper":
    "Habilitar historial de búsquedas recientes",
  "search.customisation.recentSearch.label": "Búsquedas recientes",
  "search.customisation.recentSearch.titleLabel":
    "Título de búsquedas recientes",
  "search.customisation.recentSearch.titlePlaceholder": "Búsquedas recientes",
  "search.customisation.save": "Guardar personalización",
  "search.customisation.title": "Personalización del cuadro de búsqueda",
  "search.customisation.toast.saved.description":
    "La personalización del cuadro de búsqueda se guardó correctamente.",
  "search.customisation.toast.saved.title": "Personalización guardada",
  "search.customisation.toast.saveError":
    "No se pudo guardar la personalización de búsqueda. Inténtalo de nuevo.",
  "search.customisation.unavailable": "Personalización no disponible.",
  "search.description":
    "Configura y gestiona el entrenamiento, los ajustes y las integraciones de tu búsqueda",
  "search.domains.addButton": "Agregar",
  "search.domains.addButton.a11y": "Agregar URL",
  "search.domains.addUrl.a11y": "Agregar URL permitida",
  "search.domains.addUrl.subtitle":
    "Ingrese un sitio web completo o la URL de una página. Eliminamos hashes, ignoramos los parámetros de consulta y normalizamos las barras diagonales.",
  "search.domains.addUrl.title": "Agregar URL permitida",
  "search.domains.allowedUrls.title": "URL permitidas",
  "search.domains.description":
    "Configura qué dominios pueden usar tu widget de búsqueda",
  "search.domains.empty.description":
    "Las URL permitidas son obligatorias. Agregue al menos una entrada para habilitar los widgets.",
  "search.domains.empty.label": "No hay lista de permitidos configurada",
  "search.domains.empty.subtitle":
    "Aún no hay URL configuradas. Agregue al menos una entrada para que funcionen los widgets.",
  "search.domains.entries": "{{count}} entradas",
  "search.domains.entry": "Entrada {{count}}",
  "search.domains.loading": "Cargando dominios...",
  "search.domains.remove.a11y": "Quitar {{domain}}",
  "search.domains.scope.a11y": "Alcance de la URL",
  "search.domains.scope.entireSite": "Todo el sitio",
  "search.domains.scope.pageAndSubpaths": "Página + subrutas",
  "search.domains.scope.pageOnly": "Sólo esta página",
  "search.domains.scopeLabel": "Alcance",
  "search.domains.title": "Dominios permitidos",
  "search.domains.validation.a11y": "Cómo funciona la validación de dominio",
  "search.domains.validation.bullet1":
    "Las URL permitidas son obligatorias: los widgets solo funcionarán en las entradas configuradas.",
  "search.domains.validation.bullet2":
    "Debe agregar al menos una URL para que funcionen los widgets.",
  "search.domains.validation.bullet3":
    "Las URL están normalizadas (se elimina www, se conservan las rutas y se recortan las barras diagonales).",
  "search.domains.validation.bullet4":
    "Los dominios no autorizados recibirán un error 403 Prohibido.",
  "search.domains.validation.bullet5":
    "La validación de dominio se aplica tanto al chatbot como a los widgets de búsqueda.",
  "search.domains.validation.bullet6":
    "Puede permitir un sitio completo o una sola página (con subrutas opcionales).",
  "search.domains.validation.title": "Cómo funciona la validación de dominio:",
  "search.embedding.reindex.button.idle": "Reindexar ahora",
  "search.embedding.reindex.button.running": "Reindexando…",
  "search.embedding.reindex.failed.title": "Reindexación fallida",
  "search.embedding.reindex.lastRun.failed":
    "La última reindexación falló: {{detail}}",
  "search.embedding.reindex.lastRun.incomplete":
    "La última reindexación finalizó pero {{missing}} elementos aún no están incrustados. Intentar otra vez.",
  "search.embedding.reindex.partial.body":
    "{{embedded}}/{{total}} embebido(s); {{failed}} fallaron.",
  "search.embedding.reindex.partial.title":
    "Reindexación finalizada con errores",
  "search.embedding.reindex.progress": "Reindexando {{done}} / {{total}}",
  "search.embedding.reindex.success.body":
    "{{embedded}}/{{total}} documento(s) embebido(s) con el modelo activo.",
  "search.embedding.reindex.success.title": "Reindexación completa",
  "search.embedding.status.a11y": "Incrustar estado de reindexación",
  "search.embedding.status.allEmbedded.body":
    "{{count}} vectores almacenados para {{model}}.",
  "search.embedding.status.allEmbedded.title":
    "Todos los documentos están embebidos con este modelo",
  "search.embedding.status.coverageSummary":
    "{{embedded}} de {{total}} elementos incrustados.",
  "search.embedding.status.empty.body":
    "Sube documentos o rastrea una fuente. Se embeberán con {{model}}.",
  "search.embedding.status.empty.title": "Aún no hay documentos",
  "search.embedding.status.emptyIndexed.body":
    "Agregue fuentes o documentos de rastreo y luego vuelva a indexar para {{model}}.",
  "search.embedding.status.emptyIndexed.title": "Aún no hay contenido indexado",
  "search.embedding.status.error.title":
    "No se pudo cargar el estado de embeddings",
  "search.embedding.status.fallbackWarning":
    "La configuración guardada no pudo usar su clave API; en su lugar, verificó el modelo predeterminado ({{model}}). Agregue una clave API válida y guárdela nuevamente.",
  "search.embedding.status.loadFailed":
    "No se pudo cargar el estado de inserción",
  "search.embedding.status.loading": "Comprobando embeddings…",
  "search.embedding.status.loadingStatus": "Cargando estado de inserción...",
  "search.embedding.status.needsReindex.body":
    "Tienes {{total}} documento(s) que aún no están embebidos con {{model}}. Reindexa para que aparezcan en los resultados de búsqueda.",
  "search.embedding.status.needsReindex.title":
    "Algunos documentos no están embebidos con este modelo",
  "search.embedding.status.needsReindexDetail":
    "{{embedded}} de {{total}} elementos incrustados. {{missing}} falta para {{model}}.",
  "search.embedding.status.needsReindexRecommended.title":
    "Se recomienda reindexar para este modelo de incrustación.",
  "search.embedding.status.otherCollections":
    "{{count}} embedding(s) más de este proyecto aún tienen vectores antiguos.",
  "search.embedding.status.refresh": "Actualizar",
  "search.embedding.status.refreshA11y": "Actualizar el estado de inserción",
  "search.history.confirm.deleteOne.title": "¿Eliminar sesión?",
  "search.history.confirm.deleteSelected.message":
    "¿Eliminar {{count}} sesión(es)? Esto no se puede deshacer.",
  "search.history.confirm.deleteSelected.title":
    "¿Eliminar sesiones seleccionadas?",
  "search.history.copyResponse.a11y": "Copiar respuesta",
  "search.history.deleteAll": "Eliminar todo",
  "search.history.deleteAll.confirm":
    "¿Seguro que deseas eliminar todo el historial de búsqueda? Esto no se puede deshacer.",
  "search.history.deleteAll.description":
    "Todo el historial de búsqueda se eliminó correctamente.",
  "search.history.deleteAll.error":
    "No se pudo eliminar todo el historial de búsqueda. Inténtalo de nuevo.",
  "search.history.deleteAll.title": "Eliminado",
  "search.history.deleteConversation.description":
    "Historial de búsqueda eliminado correctamente.",
  "search.history.deleteConversation.error":
    "No se pudo eliminar el historial de búsqueda. Inténtalo de nuevo.",
  "search.history.deleteConversation.title": "Eliminado",
  "search.history.deleteSelected": "Eliminar seleccionados ({{count}})",
  "search.history.deleteSelected.description":
    "{{count}} búsquedas eliminadas correctamente.",
  "search.history.deleteSelected.error":
    "No se pudieron eliminar algunas búsquedas. Inténtalo de nuevo.",
  "search.history.deleteSelected.title": "Eliminado",
  "search.history.deleteSession.a11y": "Eliminar sesión",
  "search.history.description":
    "Ver y filtrar los registros del historial de búsqueda",
  "search.history.empty": "No se encontraron conversaciones",
  "search.history.emptyState.action": "Ir a la prueba de búsqueda",
  "search.history.emptyState.body":
    "El historial de búsqueda almacena cada consulta que ejecuta. Abra la pestaña Prueba de búsqueda, ejecute una búsqueda y sus sesiones aparecerán aquí para que pueda revisar las respuestas y las fuentes.",
  "search.history.emptyState.title": "Aún no hay historial de búsqueda",
  "search.history.filter.allTime": "Todo el tiempo",
  "search.history.filter.last30Days": "Últimos 30 días",
  "search.history.filter.last7Days": "Últimos 7 días",
  "search.history.filter.lastYear": "Último año",
  "search.history.filter.placeholder": "Filtrar por fecha",
  "search.history.filter.today": "Hoy",
  "search.history.filterEmpty.body":
    "Pruebe con un término de búsqueda diferente o cambie el rango de tiempo.",
  "search.history.filterEmpty.title": "Ninguna sesión coincide con tus filtros",
  "search.history.filters": "Filtros",
  "search.history.filtersActive": "Filtros, {{count}} activo",
  "search.history.loadError":
    "No se pudo cargar el historial de búsqueda. Inténtalo de nuevo.",
  "search.history.loading": "Cargando historial de búsqueda...",
  "search.history.messageCount": "Número de búsquedas: {{count}}",
  "search.history.mock.query1": "¿Qué es la IA?",
  "search.history.mock.query2": "¿Cómo funciona el aprendizaje automático?",
  "search.history.mock.query3": "Ayuda con la configuración",
  "search.history.mock.response1": "IA significa Inteligencia Artificial...",
  "search.history.mock.response2":
    "El aprendizaje automático es un subconjunto de la IA...",
  "search.history.mock.response3": "Puedo ayudarte a configurar...",
  "search.history.mock.support": "Soporte",
  "search.history.mock.technical": "Técnico",
  "search.history.newConversation": "Nueva conversación",
  "search.history.search.a11y": "Buscar conversaciones",
  "search.history.search.placeholder": "Buscar conversaciones...",
  "search.history.searchQuery": "Consulta de búsqueda",
  "search.history.selectAll": "Seleccionar todo",
  "search.history.selectAllVisible": "Seleccionar todas las sesiones visibles",
  "search.history.selectConversation":
    "Selecciona una conversación para ver mensajes",
  "search.history.selectSession.body":
    "Elija una sesión de la lista para leer la respuesta completa, las citas y las fuentes.",
  "search.history.selectSession.title": "Seleccione una sesión de búsqueda",
  "search.history.sessionNotFound.body":
    "Es posible que esta sesión haya sido eliminada o aún se esté cargando.",
  "search.history.sessionNotFound.title": "Sesión no encontrada",
  "search.history.sessions": "Sesiones",
  "search.history.sources.topK": "Top-K: {{topK}} Fuentes ({{count}}):",
  "search.history.title": "Historial de búsqueda",
  "search.history.viewSource": "Ver fuente →",
  "search.history.viewSourceA11y": "Ver fuente {{title}}",
  "search.integrations.copyFailed":
    "No se pudo copiar el fragmento. Por favor inténtalo de nuevo.",
  "search.integrations.mobile.copy.description":
    "Código del SDK móvil copiado al portapapeles",
  "search.integrations.mobile.copy.title": "Copiado",
  "search.integrations.mobile.description":
    "Integra el SDK de búsqueda en tu app móvil",
  "search.integrations.mobile.instructions.configure":
    "Configure projectId, apiKey (rgs_live_…), endpoint y features: ['search']",
  "search.integrations.mobile.instructions.importInit":
    "Envuelva su app con SafeAreaProvider y RAGSuiteProvider",
  "search.integrations.mobile.instructions.install":
    "Expo: npx expo install @ragsuite/react-native react-native-safe-area-context expo-blur expo-linear-gradient expo-clipboard | CLI: npm install @ragsuite/react-native react-native-safe-area-context @react-native-community/blur react-native-linear-gradient @react-native-clipboard/clipboard",
  "search.integrations.mobile.instructions.start":
    "Renderice RAGSuiteSearch dentro de RAGSuiteProvider",
  "search.integrations.mobile.instructions.title":
    "Instrucciones de instalación:",
  "search.integrations.mobile.regenerate": "Regenerar",
  "search.integrations.mobile.script.commentTitle": "Integración del SDK móvil",
  "search.integrations.mobile.script.sampleApiKey": "TU_API_KEY",
  "search.integrations.mobile.scriptLabel": "Código del SDK móvil",
  "search.integrations.mobile.title": "Integración móvil",
  "search.integrations.snippetUnavailable":
    "Fragmento de integración no disponible.",
  "search.integrations.web.copy.description":
    "Script web copiado al portapapeles",
  "search.integrations.web.copy.title": "Copiado",
  "search.integrations.web.description":
    "Incrusta el widget de búsqueda en tu sitio web",
  "search.integrations.web.regenerate.button": "Regenerar",
  "search.integrations.web.regenerate.description":
    "El script del widget de búsqueda se ha regenerado",
  "search.integrations.web.regenerate.title": "Regenerado",
  "search.integrations.web.script.commentAdvanced":
    "Alternativa: configuración avanzada",
  "search.integrations.web.script.commentPlacement":
    "Añade este script antes de la etiqueta de cierre </body>",
  "search.integrations.web.script.commentTitle":
    "Widget de búsqueda de RAG Suite",
  "search.integrations.web.script.sampleTitle": "Asistente de búsqueda",
  "search.integrations.web.script.sampleWelcome":
    "Hola. Puedo ayudarle a buscar información.",
  "search.integrations.web.scriptLabel": "Script del widget web",
  "search.integrations.web.title": "Integración web",
  "search.languages.ar": "Árabe",
  "search.languages.de": "Alemán",
  "search.languages.en": "Inglés (EE. UU.)",
  "search.languages.enGb": "Inglés (Reino Unido)",
  "search.languages.es": "Español",
  "search.languages.fr": "Francés",
  "search.languages.hi": "hindi",
  "search.languages.pt": "Portugués (Brasil)",
  "search.languages.zh": "Chino (simplificado)",
  "search.models.apiKey.helper": "Clave API del proveedor seleccionado",
  "search.models.apiKey.label": "Clave API",
  "search.models.apiKey.ollamaHelper":
    "La clave API se establece automáticamente para el proveedor Ollama",
  "search.models.apiKey.ollamaPlaceholder":
    "Se completa automáticamente para Ollama",
  "search.models.apiKey.placeholder": "Ingresa la clave API",
  "search.models.apiKey.savedPlaceholder":
    "Ingrese la nueva clave para reemplazar",
  "search.models.chatModel.helper":
    "El modelo usado para tareas de chat/completado",
  "search.models.chatModel.label": "Modelo de chat",
  "search.models.chatModel.noneAvailable": "No hay modelos disponibles",
  "search.models.chatModel.placeholder": "Seleccionar un modelo",
  "search.models.chatModel.selectProvider": "Selecciona primero un proveedor",
  "search.models.description":
    "Configura el proveedor de IA y la selección del modelo",
  "search.models.embeddingModel.helper":
    "El modelo usado para embeddings (opcional)",
  "search.models.embeddingModel.helperFallback":
    "Sin modelo seleccionado — se usará Jina (predeterminado).",
  "search.models.embeddingModel.label": "Modelo de embeddings",
  "search.models.embeddingModel.none": "Ninguno (opcional)",
  "search.models.embeddingModel.noneAvailable":
    "No hay modelos de embeddings disponibles para este proveedor",
  "search.models.embeddingModel.placeholder":
    "Seleccionar un modelo de embeddings (opcional)",
  "search.models.embeddingModel.selectProvider":
    "Selecciona primero un proveedor",
  "search.models.loading": "Cargando ajustes del modelo...",
  "search.models.parameters.bestOf": "La mejor de",
  "search.models.parameters.frequencyPenalty": "Penalización de frecuencia",
  "search.models.parameters.frequencyPenaltyHint":
    "(chatgpt.openai_frequency_penalty [cadena])",
  "search.models.parameters.presencePenalty": "Penalización de presencia",
  "search.models.parameters.presencePenaltyHint":
    "(chatgpt.openai_presence_penalty [cadena])",
  "search.models.parameters.temperature": "Temperatura",
  "search.models.parameters.temperatureHint":
    "(chatgpt.openai_temperature [cadena])",
  "search.models.parameters.topP": "P superior",
  "search.models.parameters.topPHint": "(chatgpt.openai_top_p [cadena])",
  "search.models.provider.label": "Proveedor de modelo",
  "search.models.provider.loading": "Cargando proveedores...",
  "search.models.provider.placeholder": "Seleccionar proveedor",
  "search.models.rag.maxTokens": "Tokens máximos",
  "search.models.rag.maxTokensHelp.long":
    "Mínimo: 400 tokens (para respuestas LARGAS). 0 = ilimitado, máx 3000",
  "search.models.rag.maxTokensHelp.short":
    "Mínimo: 200 tokens (para respuestas CORTAS). 0 = ilimitado, máx 3000",
  "search.models.rag.similarityThreshold": "Umbral de similitud",
  "search.models.rag.similarityThresholdHelper":
    "Puntuación mínima de similitud para incluir documentos",
  "search.models.rag.topK": "Resultados Top-K",
  "search.models.rag.topKHelper":
    "Número de documentos a recuperar de la base de vectores",
  "search.models.rag.unlimited": "Ilimitado",
  "search.models.rag.useReranker": "Usar reranker",
  "search.models.rag.useRerankerHelper": "Mejorar la relevancia con reranking",
  "search.models.save": "Guardar ajustes del modelo",
  "search.models.saveError.fallback":
    "No se pudieron guardar los ajustes del modelo. Inténtalo de nuevo.",
  "search.models.title": "Ajustes del modelo",
  "search.models.unavailable":
    "La configuración del modelo no está disponible.",
  "search.models.validationError.description":
    "Por favor ingresa una clave API válida",
  "search.models.validationError.title": "Error de validación",
  "search.primaryTab.a11y": "Pestaña {{label}}",
  "search.prompt.default": "Eres un asistente de IA útil...",
  "search.prompt.description":
    "Personaliza el prompt del sistema para tu configuración de búsqueda",
  "search.prompt.helper":
    "Este prompt define el comportamiento y la personalidad del asistente",
  "search.prompt.label": "Prompt del sistema",
  "search.prompt.loading": "Cargando prompt...",
  "search.prompt.placeholder": "Introduce tu prompt del sistema...",
  "search.prompt.save": "Guardar prompt",
  "search.prompt.saving": "Guardando...",
  "search.prompt.title": "Editar prompt",
  "search.questions.answer.close": "Cerrar respuesta",
  "search.questions.answer.edit": "Añadir/editar respuesta",
  "search.questions.answer.helper":
    "Esta respuesta se mostrará cuando los usuarios hagan clic en esta pregunta",
  "search.questions.answer.label": "Respuesta predefinida",
  "search.questions.answer.loading": "Cargando respuesta predefinida...",
  "search.questions.answer.placeholder":
    "Introduce una respuesta predefinida para esta pregunta...",
  "search.questions.answer.testPlaceholder":
    "Respuesta predeterminada opcional para la prueba de búsqueda",
  "search.questions.description":
    "Gestiona las preguntas sugeridas para los usuarios",
  "search.questions.enable.helper":
    "Mostrar preguntas sugeridas en la barra de búsqueda",
  "search.questions.enable.label": "Habilitar preguntas predefinidas",
  "search.questions.limit.label": "Límite de preguntas",
  "search.questions.list.label": "Preguntas",
  "search.questions.list.placeholder": "Introduce una pregunta...",
  "search.questions.loading": "Cargando ajustes...",
  "search.questions.save": "Guardar cambios",
  "search.questions.title": "Configuración de preguntas predefinidas",
  "search.settings.citations": "Formato de citas",
  "search.settings.citationsShort": "Citas",
  "search.settings.configShort": "configuración",
  "search.settings.configuration": "Configuración",
  "search.settings.customisation": "Personalización",
  "search.settings.customShort": "Personalizar",
  "search.settings.domains": "Dominios permitidos",
  "search.settings.models": "Ajustes del modelo",
  "search.settings.modelsShort": "Modelos",
  "search.settings.overview": "Resumen",
  "search.settings.preview.allowedDomains": "Dominios permitidos",
  "search.settings.preview.allowedUrls": "URLs permitidas:",
  "search.settings.preview.allowlist": "Lista de permitidos:",
  "search.settings.preview.apiKeyLabel": "Clave API:",
  "search.settings.preview.buttonType": "Tipo de botón:",
  "search.settings.preview.buttonType.iconOnly": "Solo icono",
  "search.settings.preview.buttonType.withLabel": "Con etiqueta",
  "search.settings.preview.chatModel": "Charla: {{model}}",
  "search.settings.preview.citations": "Citas",
  "search.settings.preview.configuredCount": "{{count}} configurados",
  "search.settings.preview.customisation": "Personalización",
  "search.settings.preview.description":
    "Vista previa en vivo de todas las configuraciones de ajustes",
  "search.settings.preview.disabled": "Deshabilitado",
  "search.settings.preview.embeddingModel": "Embeddings: {{model}}",
  "search.settings.preview.enabled": "Habilitado",
  "search.settings.preview.formType": "Tipo de formulario:",
  "search.settings.preview.formType.default": "Predeterminado",
  "search.settings.preview.formType.withButton": "Con botón",
  "search.settings.preview.iconLabel": "Icono:",
  "search.settings.preview.languageLabel": "Idioma:",
  "search.settings.preview.layout": "Diseño:",
  "search.settings.preview.models": "Modelos",
  "search.settings.preview.moreCount": "+{{count}} más",
  "search.settings.preview.noDomains": "No hay dominios configurados",
  "search.settings.preview.numbering": "Numeración:",
  "search.settings.preview.questions": "Preguntas:",
  "search.settings.preview.recentSearch": "Búsquedas recientes:",
  "search.settings.preview.searchConfig": "Config de búsqueda",
  "search.settings.preview.style": "Estilo:",
  "search.settings.preview.styleLabel": "Estilo:",
  "search.settings.preview.title": "Vista previa de configuración de ajustes",
  "search.settings.preview.titleLabel": "Título:",
  "search.settings.preview.unavailable":
    "La descripción general de la configuración no está disponible.",
  "search.settings.questions": "Preguntas",
  "search.settings.questionsShort": "Preguntas",
  "search.settings.subtitle":
    "Configurar modelo, cuadro de búsqueda, dominios e integraciones.",
  "search.settings.title": "Ajustes",
  "search.settings.toast.saved.description":
    "Tus ajustes de búsqueda se han guardado correctamente.",
  "search.settings.toast.saved.title": "Ajustes guardados",
  "search.tabs.integrations": "Integraciones",
  "search.tabs.integrationsCompact": "Integraciones",
  "search.tabs.searchTest": "Prueba de búsqueda",
  "search.tabs.searchTestCompact": "Prueba",
  "search.tabs.settings": "Ajustes",
  "search.tabs.training": "Entrenamiento",
  "search.test.clearA11y": "Borrar búsqueda",
  "search.test.clearSearchAria": "Borrar búsqueda",
  "search.test.copyAnswerA11y": "Copiar respuesta",
  "search.test.copyFailed": "No se pudo copiar la respuesta.",
  "search.test.copySuccess": "Respuesta copiada.",
  "search.test.error.general":
    "Lo siento, ocurrió un error al buscar: {{message}}. Inténtalo de nuevo.",
  "search.test.error.unknown": "Error desconocido",
  "search.test.error.validation": "Error de validación: {{message}}",
  "search.test.feedback.cancel.a11y": "Cancelar comentarios",
  "search.test.feedback.characters": "{{current}}/{{max}} caracteres",
  "search.test.feedback.close.a11y": "Cerrar formulario de comentarios",
  "search.test.feedback.comments.a11y":
    "Comentarios de retroalimentación adicionales",
  "search.test.feedback.commentsOptional": "Comentarios adicionales (opcional)",
  "search.test.feedback.commentsPlaceholder":
    "Cuéntanos más sobre tu experiencia con esta respuesta...",
  "search.test.feedback.negative": "Comentarios negativos",
  "search.test.feedback.positive": "Comentarios positivos",
  "search.test.feedback.rate.a11y": "Califica {{value}} sobre 5",
  "search.test.feedback.rating": "Clasificación",
  "search.test.feedback.reason.accurate": "precisa",
  "search.test.feedback.reason.clear": "clara",
  "search.test.feedback.reason.complete": "completa",
  "search.test.feedback.reason.fast response": "respuesta rápida",
  "search.test.feedback.reason.hallucinated": "alucinada",
  "search.test.feedback.reason.helpful": "útil",
  "search.test.feedback.reason.incorrect": "incorrecta",
  "search.test.feedback.reason.low quality": "baja calidad",
  "search.test.feedback.reason.missing sources": "fuentes faltantes",
  "search.test.feedback.reason.outdated information":
    "información desactualizada",
  "search.test.feedback.reason.poor formatting": "mal formato",
  "search.test.feedback.reason.slow response": "respuesta lenta",
  "search.test.feedback.reason.too technical": "Demasiado técnica",
  "search.test.feedback.reasonsOptional": "Razones (opcional)",
  "search.test.feedback.submit": "Enviar comentarios",
  "search.test.feedback.submit.a11y": "Enviar comentarios",
  "search.test.feedback.submitted": "Gracias. Su comentario se ha enviado.",
  "search.test.feedback.submitting": "Sumisión…",
  "search.test.feedback.thanks": "Gracias por su comentario.",
  "search.test.pendingResponse": "Buscando con la configuración RAG...",
  "search.test.queryPlaceholder": "Buscar usando IA...",
  "search.test.recentSearch.title": "Búsqueda reciente",
  "search.test.recentSearches.title": "Búsquedas recientes",
  "search.test.searchButton": "Buscar",
  "search.test.sources.topK": "Top-K: {{topK}} Fuentes ({{count}}):",
  "search.test.sources.viewSource": "Ver fuente →",
  "search.test.sources.viewSourceA11y": "Ver fuente {{title}}",
  "search.test.subtitle":
    "Pruebe su configuración de búsqueda con consultas en vivo",
  "search.test.suggestions.title": "Sugerencias",
  "search.test.thinking": "La IA está pensando...",
  "search.test.time.earlier": "Más temprano",
  "search.test.time.hoursAgoShort": "Hace {{count}}h",
  "search.test.time.justNow": "Ahora mismo",
  "search.test.time.minutesAgoShort": "Hace {{count}}m",
  "search.test.title": "Prueba de búsqueda",
  "search.test.validation.minChars": "Por favor ingresa al menos 3 caracteres",
  "search.time.daysAgo": "hace {{count}} días",
  "search.time.hoursAgo": "hace {{count}} horas",
  "search.time.justNow": "justo ahora",
  "search.time.minutesAgo": "hace {{count}} minutos",
  "search.time.monthsAgo": "hace {{count}} meses",
  "search.time.unknown": "Desconocido",
  "search.time.yearsAgo": "hace {{count}} años",
  "search.title": "Configuración de búsqueda",
  "search.training.activeConfig": "Configuración activa",
  "search.training.activeConfig.unavailable":
    "Sin configuración de entrenamiento activo.",
  "search.training.activeStatus.active": "Activo",
  "search.training.activeStatus.activeBadge": "Activo",
  "search.training.activeStatus.activeDescription":
    "La búsqueda está activa actualmente",
  "search.training.activeStatus.description":
    "Habilita o deshabilita el servicio de búsqueda",
  "search.training.activeStatus.disabled": "Deshabilitado",
  "search.training.activeStatus.enabled": "Habilitado",
  "search.training.activeStatus.inactive": "Inactivo",
  "search.training.activeStatus.inactiveDescription":
    "La búsqueda está inactiva actualmente",
  "search.training.activeStatus.live": "La búsqueda está activa",
  "search.training.activeStatus.loading": "Cargando estado de activación...",
  "search.training.activeStatus.offline": "La búsqueda está inactiva",
  "search.training.activeStatus.statusLabel": "Estado:",
  "search.training.activeStatus.title": "Estado activo",
  "search.training.activeStatus.updating": "Actualizando...",
  "search.training.configShort": "configuración",
  "search.training.historyShort": "Historial",
  "search.training.overview": "Resumen",
  "search.training.overview.unavailable":
    "No hay descripción general de la capacitación disponible.",
  "search.training.preview.description":
    "Vista previa en vivo de todas las configuraciones de entrenamiento",
  "search.training.preview.title":
    "Vista previa de configuración de entrenamiento",
  "search.training.prompt.chars": "{{count}} caracteres",
  "search.training.prompt.empty": "No hay prompt configurado",
  "search.training.prompt.length": "Longitud:",
  "search.training.prompt.loading": "Cargando prompt...",
  "search.training.prompt.title": "Prompt del sistema",
  "search.training.prompt.words": "Palabras:",
  "search.training.responseConfig.description":
    "Configura cómo responde la búsqueda a las consultas",
  "search.training.responseConfig.loading":
    "Cargando configuración de respuesta...",
  "search.training.responseConfig.title": "Configuración de respuesta",
  "search.training.responseConfig.toast.description":
    "El tipo de respuesta se estableció en respuestas {{type}}.",
  "search.training.responseConfig.toast.errorDescription":
    "No se pudo guardar la configuración de respuesta. Inténtalo de nuevo.",
  "search.training.responseConfig.toast.errorTitle": "Error al guardar",
  "search.training.responseConfig.toast.title":
    "Configuración de respuesta guardada",
  "search.training.responseType.brief": "Breve",
  "search.training.responseType.briefHelp":
    "La búsqueda proporciona respuestas breves y concisas",
  "search.training.responseType.detailed": "Detallada",
  "search.training.responseType.detailedHelp":
    "La búsqueda proporciona respuestas detalladas y completas",
  "search.training.responseType.label": "Tipo de respuesta",
  "search.training.responseType.long": "Respuestas largas",
  "search.training.responseType.longHelp":
    "La búsqueda proporcionará respuestas detalladas y completas",
  "search.training.responseType.short": "Respuestas cortas",
  "search.training.responseType.shortHelp":
    "La búsqueda proporcionará respuestas breves y concisas",
  "search.training.responseType.title": "Tipo de respuesta",
  "search.training.searchHistory": "Historial de búsqueda",
  "search.training.searchHistory.conversations": "{{count}} conversaciones",
  "search.training.searchHistory.filtered": "Filtrado: {{filter}}",
  "search.training.searchHistory.title": "Historial de búsqueda",
  "search.training.searchHistory.total": "{{count}} en total",
  "search.training.searchHistory.totalMessages": "Mensajes totales:",
  "search.training.searchStatus.label": "Estado de búsqueda",
  "search.training.subtitle":
    "Supervise la indexación, la configuración activa y el historial de búsqueda.",
  "search.training.title": "Entrenamiento",
  "search.widget.avatar.default": "Predeterminado {{count}}",
  "search.widget.colors.blue": "Azul",
  "search.widget.colors.darkGray": "Gris oscuro",
  "search.widget.colors.gradient": "Gradiente",
  "search.widget.colors.green": "Verde",
  "search.widget.colors.orange": "Naranja",
  "search.widget.colors.purple": "Morado",
  "search.widget.preview.a11y.configuration":
    "Vista previa en vivo del cuadro de búsqueda",
  "search.widget.preview.a11y.customisation":
    "Vista previa en vivo de la personalización del cuadro de búsqueda",
  "search.widget.preview.a11y.questions":
    "Vista previa en vivo de preguntas predefinidas",
  "search.widget.preview.input.a11y": "Vista previa de la entrada de búsqueda",
  "search.widget.preview.justNow": "En este momento",
  "search.widget.preview.subtitle":
    "Vista previa en tiempo real de la configuración de su cuadro de búsqueda.",
  "search.widget.preview.suggestedQuestions": "Preguntas sugeridas",
  "search.widget.preview.title": "Vista previa en vivo",
  "search.widget.toast.avatarUploaded.description":
    "El avatar personalizado se guardará cuando hagas clic en Guardar.",
  "search.widget.toast.avatarUploaded.title": "Avatar personalizado cargado",
  "search.widget.toast.logoUploaded.description":
    "El logotipo del widget se guardará cuando hagas clic en Guardar.",
  "search.widget.toast.logoUploaded.title": "Logotipo del widget cargado",
  "settings.actions.reset": "Restablecer",
  "settings.actions.saveChanges": "Guardar cambios",
  "settings.api-keys": "Claves API",
  "settings.audit-logs": "Registros de auditoría y cumplimiento",
  "settings.branding.backgroundTheme": "Tema de fondo",
  "settings.branding.backgroundTheme.geometric": "Geométrico",
  "settings.branding.backgroundTheme.simple": "Predeterminado",
  "settings.branding.livePreview": "Vista previa en vivo",
  "settings.branding.logoHint": "Recomendado: PNG o SVG de 64x64 px",
  "settings.branding.logoPreviewAlt": "Vista previa del logo",
  "settings.branding.logoRemove": "Eliminar",
  "settings.branding.logoUpload": "Subir logo",
  "settings.branding.orgName": "Nombre de la organización",
  "settings.branding.previewDescription":
    "Así se verá tu marca en la interfaz de administración y el widget incrustable.",
  "settings.branding.primaryButton": "Botón principal",
  "settings.branding.primaryColor": "Color primario",
  "settings.branding.themePresets": "Preajustes de tema",
  "settings.branding.title": "Opciones de tema",
  "settings.branding.toast.backgroundThemeUpdated.description":
    "Tema de fondo cambiado a {{theme}}.",
  "settings.branding.toast.backgroundThemeUpdated.title":
    "Tema de fondo actualizado",
  "settings.branding.toast.logoUploaded.description":
    "La vista previa del logo se actualizó.",
  "settings.branding.toast.logoUploaded.title": "Logo subido",
  "settings.branding.toast.reset.description":
    "La configuración de marca se restableció a los valores predeterminados.",
  "settings.branding.toast.reset.title": "Marca restablecida",
  "settings.branding.toast.resetFailed.description":
    "No se pudo restablecer la configuración de marca.",
  "settings.branding.toast.resetFailed.title": "Restablecimiento fallido",
  "settings.citation-formatting": "Formato de Citas",
  "settings.data-retention": "Retención de Datos",
  "settings.description":
    "Gestiona la configuración y preferencias de tu organización",
  "settings.feedback.dismissError": "Descartar notificación de error",
  "settings.i18n": "Internacionalización",
  "settings.i18n.defaultLanguage": "Idioma predeterminado",
  "settings.i18n.description":
    "Idioma predeterminado para la interfaz de administración y respuestas de IA",
  "settings.i18n.save": "Guardar idioma",
  "settings.i18n.title": "Internacionalización",
  "settings.i18n.toast.reset.description":
    "Idioma predeterminado restablecido a {{language}}.",
  "settings.i18n.toast.reset.title": "Idioma restablecido",
  "settings.i18n.toast.saved.description":
    "Idioma predeterminado establecido en {{language}}.",
  "settings.i18n.toast.saved.title": "Idioma guardado",
  "settings.n8n": "Integración n8n",
  "settings.profile": "Perfil y Marca",
  "settings.retention.autoDelete.description":
    "Elimina automáticamente los registros antiguos una vez que se alcanza el límite de retención.",
  "settings.retention.autoDelete.label": "Habilitar la eliminación automática",
  "settings.retention.confirmation.error":
    "Escriba BORRAR para confirmar una retención más breve.",
  "settings.retention.confirmation.label": "Confirmación de seguridad",
  "settings.retention.confirmation.placeholder": "Tipo BORRAR",
  "settings.retention.days.label": "Días de retención",
  "settings.retention.days.rangeHint":
    "Elija un valor entre {{min}} y {{max}} días.",
  "settings.retention.period.hint":
    "Número de días para conservar consultas, respuestas y comentarios de usuarios",
  "settings.retention.period.label": "Periodo de retención (días)",
  "settings.retention.policy.rule1":
    "Los registros de consultas y respuestas se eliminarán automáticamente después de {{count}} días",
  "settings.retention.policy.rule2":
    "Los datos de comentarios y analítica se conservarán durante el mismo período",
  "settings.retention.policy.rule3":
    "Los documentos rastreados y embeddings no se ven afectados por esta política",
  "settings.retention.policy.rule4":
    "Los registros del sistema y auditorías siguen reglas de retención separadas",
  "settings.retention.title": "Política de retención de datos",
  "settings.subtitle":
    "Configure la experiencia del espacio de trabajo, la política de retención, la localización y las preferencias de soporte.",
  "settings.system-health": "Salud del Sistema",
  "settings.theme.fontScale": "Escala de fuente",
  "settings.theme.preview.instantDescription":
    "Obtenga una vista previa de las actualizaciones al instante para el tema, el color y la escala de fuente.",
  "settings.theme.preview.sampleHeading": "Texto de encabezado de muestra",
  "settings.title": "Configuración",
  "sharepoint.refresh": "Actualizar",
  "signup.errors.emailAlreadyInUse": "Este correo electrónico ya está en uso.",
  "signup.errors.generic": "El registro falló. Por favor intenta de nuevo.",
  "signup.errors.missingFields": "Por favor completa todos los campos",
  "signup.errors.passwordTooShort":
    "La contraseña debe tener al menos 6 caracteres",
  "signup.errors.usernameAlreadyInUse":
    "Este nombre de usuario ya está en uso.",
  "signup.form.confirmPassword.label": "Confirmar Contraseña",
  "signup.form.confirmPassword.placeholder": "Confirma tu contraseña",
  "signup.form.email.label": "Dirección de correo electrónico",
  "signup.form.email.placeholder": "Ingresa tu correo electrónico",
  "signup.form.password.label": "Contraseña",
  "signup.form.password.placeholder": "Ingresa tu contraseña",
  "signup.form.submit.label": "Crear Cuenta",
  "signup.form.submit.loading": "Creando cuenta...",
  "signup.form.username.label": "Nombre de usuario",
  "signup.form.username.placeholder": "Ingresa tu nombre de usuario",
  "signup.login.link": "Iniciar sesión",
  "signup.login.prompt": "¿Ya tienes una cuenta?",
  "signup.subtitle": "Regístrate para comenzar con RAGSuite",
  "signup.subtitle.mobile": "Crea tu cuenta para comenzar",
  "signup.title": "Crea tu cuenta",
  "slack.refresh": "Actualizar",
  "system-health.description":
    "Supervise el estado y rendimiento de los servicios del sistema",
  "system-health.empty.noServices": "Aún no hay servicios registrados.",
  "system-health.error.title": "No se pudo cargar la salud del sistema",
  "system-health.error.unknown": "Ocurrió un error desconocido",
  "system-health.healthScore": "Puntuación de salud",
  "system-health.legend.atRisk.description": "El servicio puede fallar pronto",
  "system-health.legend.degraded.description": "Servicio con problemas",
  "system-health.legend.down.description": "Servicio no disponible",
  "system-health.legend.healthy.description": "Servicio operando normalmente",
  "system-health.legend.title": "Leyenda de salud",
  "system-health.loading": "Cargando datos de salud del sistema...",
  "system-health.overall.lastUpdated": "Última actualización: {{timestamp}}",
  "system-health.overall.title": "Salud general del sistema",
  "system-health.predicted.days": "~{{count}} d",
  "system-health.predicted.hours": "~{{count}} h",
  "system-health.predicted.minutes": "~{{count}} min",
  "system-health.service.lastHeartbeat": "Último latido",
  "system-health.service.predictedFailure": "Fallo previsto",
  "system-health.service.reason": "Motivo",
  "system-health.service.uptime": "Tiempo de actividad",
  "system-health.services.description":
    "Métricas y estado de salud de cada servicio",
  "system-health.services.title": "Estado del servicio",
  "system-health.status.atRisk": "En riesgo",
  "system-health.status.degraded": "Degradado",
  "system-health.status.down": "Caído",
  "system-health.status.healthy": "Saludable",
  "system-health.status.unknown": "Desconocido",
  "system-health.time.daysAgo": "hace {{count}} d",
  "system-health.time.hoursAgo": "hace {{count}} h",
  "system-health.time.minutesAgo": "hace {{count}} min",
  "system-health.time.secondsAgo": "hace {{count}} s",
  "system-health.title": "Salud del sistema",
  "system-health.toast.refreshed.description":
    "El estado de salud se actualizó correctamente.",
  "system-health.toast.refreshed.title": "Salud del sistema actualizada",
  "system-health.toast.refreshing.description":
    "Obteniendo el estado de salud más reciente...",
  "system-health.toast.refreshing.title": "Actualizando salud del sistema",
  "system-health.value.na": "N/D",
  "theme.dark": "Modo oscuro",
  "theme.light": "Modo claro",
  "theme.toggle": "Cambiar tema",
  "tour.completed": "Completado",
  "tour.steps.notifications.title": "Notificaciones",
  "tour.steps.welcome.title": "¡Bienvenido a {{brand}}!",
  "userMenu.accountLabel": "Cuenta",
  "userMenu.profileDescription": "Administra los detalles de tu cuenta",
  "userMenu.settingsDescription": "Preferencias y configuración",
  "userMenu.signOut": "Cerrar sesión",
  "verifyEmail.backToLogin": "Volver para iniciar sesión",
  "verifyEmail.checkSubtitle":
    "Enviamos un enlace de verificación. Ábralo para activar su cuenta, luego inicie sesión.",
  "verifyEmail.checkSubtitleOtp":
    "Le enviamos un código de 6 dígitos a su correo electrónico. Ingréselo a continuación para verificar su cuenta; iniciará sesión automáticamente.",
  "verifyEmail.checkTitle": "Revise su correo electrónico",
  "verifyEmail.errors.invalidCodeLength":
    "Por favor ingrese el código de 6 dígitos de su correo electrónico.",
  "verifyEmail.errors.missingEmail":
    "Por favor ingrese su dirección de correo electrónico.",
  "verifyEmail.errors.missingToken":
    "Falta el enlace de verificación o no es válido.",
  "verifyEmail.errors.resendFailed":
    "No se pudo reenviar el correo electrónico de verificación. Inténtelo de nuevo más tarde.",
  "verifyEmail.errors.verifyFailed":
    "La verificación falló. El enlace puede estar caducado o ya utilizado.",
  "verifyEmail.form.submit.label": "Introducir código de verificación",
  "verifyEmail.otpLabel": "Código de verificación",
  "verifyEmail.redirecting": "Redirigiendo…",
  "verifyEmail.resend.helper":
    "Revise su bandeja de entrada para el código de 6 dígitos. Si no llega en unos minutos, puede solicitar un código nuevo en la siguiente pantalla.",
  "verifyEmail.resendButton": "Reenviar correo electrónico de verificación",
  "verifyEmail.resending": "Envío…",
  "verifyEmail.resendSuccess":
    "Si su cuenta está pendiente de verificación, se ha enviado un nuevo código.",
  "verifyEmail.subtitle":
    "Enviamos un código de verificación a su correo electrónico. Introdúzcalo en la siguiente pantalla para activar su cuenta.",
  "verifyEmail.success": "Correo verificado. Redirigiéndole a la aplicación…",
  "verifyEmail.successOtherTab":
    "Correo verificado. Vuelva a la pestaña original; debería actualizarse automáticamente.",
  "verifyEmail.title": "Verifique su correo electrónico",
  "verifyEmail.verifiedElsewhere":
    "Correo verificado. Llevándole a la aplicación…",
  "verifyEmail.verifyButton": "Verificar y continuar",
  "verifyEmail.verifying": "Verificando su dirección de correo electrónico...",
  "verifyEmail.verifyTitle": "Verificando tu correo electrónico",
};
