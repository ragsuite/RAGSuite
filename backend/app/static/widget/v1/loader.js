/**
 * RAG SUITE WIDGET LOADER (SINGLE PROJECT)
 * Prefer AppChatWidget via /embed/chatbot iframe (same customer script URLs).
 * Fall back to legacy widget.umd.js when the admin embed route is unavailable.
 */
(function() {
  'use strict';

  function injectBrandTypography() {
    if (document.getElementById('ragsuite-brand-fonts')) return;
    const link = document.createElement('link');
    link.id = 'ragsuite-brand-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;500&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.id = 'ragsuite-brand-tokens';
    style.textContent =
      ':host,.ragsuite-widget-root,#ragsuite-widget-container{font-family:"Hanken Grotesk",-apple-system,"Segoe UI",Roboto,Arial,sans-serif!important;color:#1B1A17!important;}';
    document.head.appendChild(style);
  }
  injectBrandTypography();

  const scriptTag = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].getAttribute('data-ragsuite-project-id')) {
        return scripts[i];
      }
    }
    return null;
  })();

  if (!scriptTag) {
    console.error('❌ RAG Suite: Script tag not found.');
    return;
  }

  const projectId = scriptTag.getAttribute('data-ragsuite-project-id');
  const DEV_PORTS = new Set(['3000', '5173', '5174', '5175', '6173', '9191']);
  const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');
  const isPrivateOrLoopbackHost = (hostname) => {
    const host = String(hostname || '').toLowerCase().trim();
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
    if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
    if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
    return false;
  };
  const getScriptOrigin = () => {
    try {
      const scriptSrc = scriptTag.getAttribute('src') || scriptTag.src;
      return scriptSrc ? new URL(scriptSrc, window.location.href).origin : window.location.origin;
    } catch {
      return window.location.origin;
    }
  };
  const getDefaultApiEndpoint = () => {
    try {
      const scriptSrc = scriptTag.getAttribute('src') || scriptTag.src;
      if (scriptSrc) {
        const scriptUrl = new URL(scriptSrc, window.location.href);
        return `${scriptUrl.origin}/api/v1`;
      }
    } catch (error) {
      console.warn('RAG Suite: Could not infer API endpoint from script src:', error);
    }
    return `${window.location.origin}/api/v1`;
  };
  const resolveApiEndpoint = (raw) => {
    const fallbackUrl = new URL(getDefaultApiEndpoint(), window.location.href);
    let resolved;
    try {
      resolved = new URL(String(raw || '').trim() || fallbackUrl.toString(), window.location.href);
    } catch {
      resolved = fallbackUrl;
    }
    if (DEV_PORTS.has(resolved.port || '') && resolved.port !== '9191') {
      resolved.port = '9090';
      if (!resolved.pathname || resolved.pathname === '/') {
        resolved.pathname = '/api/v1';
      }
    }
    const scriptOrigin = getScriptOrigin();
    const scriptUrl = new URL(scriptOrigin, window.location.href);
    const looksPrivate = isPrivateOrLoopbackHost(resolved.hostname) || (DEV_PORTS.has(resolved.port || '') && resolved.port !== '9191');
    const scriptLooksPublic = !isPrivateOrLoopbackHost(scriptUrl.hostname) && !DEV_PORTS.has(scriptUrl.port || '');
    if (looksPrivate && scriptLooksPublic) {
      resolved = new URL(resolved.pathname || '/api/v1', scriptUrl.origin);
      if (!resolved.pathname || resolved.pathname === '/') {
        resolved.pathname = '/api/v1';
      }
    }
    if (window.location.protocol === 'https:' && resolved.protocol === 'http:' && scriptUrl.protocol === 'https:') {
      resolved = new URL(resolved.pathname || '/api/v1', scriptUrl.origin);
      if (!resolved.pathname || resolved.pathname === '/') {
        resolved.pathname = '/api/v1';
      }
    }
    const normalizedPath = String(resolved.pathname || '').replace(/\/+$/, '');
    if (!normalizedPath || normalizedPath === '/') {
      resolved.pathname = '/api/v1';
    }
    return trimTrailingSlash(resolved.toString());
  };
  const apiEndpoint = resolveApiEndpoint(scriptTag.getAttribute('data-api-endpoint'));
  const widgetVersion = scriptTag.getAttribute('data-version') || 'v1';
  const windowConfig = window.ragSuiteConfig || {};
  const cacheBustValue = scriptTag.getAttribute('data-cache-bust') ||
    window.__RAGSUITE_BUILD_ID__ || Date.now().toString();
  const cacheSuffix = cacheBustValue ? `?v=${encodeURIComponent(cacheBustValue)}` : '';

  const config = {
    projectId: windowConfig.projectId || projectId,
    apiEndpoint: resolveApiEndpoint(windowConfig.apiEndpoint || apiEndpoint),
    position: windowConfig.position || scriptTag.getAttribute('data-position') || 'bottom-right',
    zIndex: windowConfig.zIndex || parseInt(scriptTag.getAttribute('data-z-index') || '99999', 10),
    primaryColor: windowConfig.primaryColor || scriptTag.getAttribute('data-primary-color'),
    title: windowConfig.title || scriptTag.getAttribute('data-title'),
    welcomeMessage: windowConfig.welcomeMessage || scriptTag.getAttribute('data-welcome-message'),
    orgName: windowConfig.orgName || scriptTag.getAttribute('data-org-name'),
    chatbotTitle: windowConfig.chatbotTitle || scriptTag.getAttribute('data-chatbot-title'),
    widgetLogoUrl: windowConfig.widgetLogoUrl || scriptTag.getAttribute('data-logo-url'),
    widgetAvatar: windowConfig.widgetAvatar || scriptTag.getAttribute('data-avatar'),
    widgetShowLogo: windowConfig.widgetShowLogo !== undefined ? windowConfig.widgetShowLogo :
      scriptTag.getAttribute('data-show-logo') === 'true',
    widgetShowDateTime: windowConfig.widgetShowDateTime !== undefined ? windowConfig.widgetShowDateTime :
      scriptTag.getAttribute('data-show-datetime') === 'true',
    widgetBottomSpace: windowConfig.widgetBottomSpace ||
      parseInt(scriptTag.getAttribute('data-bottom-space') || '20', 10),
    widgetFontSize: windowConfig.widgetFontSize ||
      parseInt(scriptTag.getAttribute('data-font-size') || '14', 10),
    widgetTriggerBorderRadius: windowConfig.widgetTriggerBorderRadius ||
      parseInt(scriptTag.getAttribute('data-border-radius') || '50', 10),
    widgetOffsetX: windowConfig.widgetOffsetX ||
      parseInt(scriptTag.getAttribute('data-offset-x') || '20', 10),
    widgetOffsetY: windowConfig.widgetOffsetY ||
      parseInt(scriptTag.getAttribute('data-offset-y') || '20', 10),
  };

  if (!config.projectId) {
    console.error('RAG Suite: projectId is required.');
    return;
  }

  const perProjectLoaderKey = `__RAGSUITE_CHATBOT_LOADER_${config.projectId}__`;
  if (window[perProjectLoaderKey]) return;
  window[perProjectLoaderKey] = true;

  const assetOrigin = getScriptOrigin();
  window.RAGSUITE_ASSET_ORIGIN = assetOrigin;
  const EMBED_READY_TIMEOUT_MS = 12000;
  const EMBED_MESSAGE_SOURCE = 'ragsuite-chatbot-embed';

  const uniqueOrigins = (origins) => {
    const out = [];
    origins.forEach((origin) => {
      if (origin && out.indexOf(origin) === -1) out.push(origin);
    });
    return out;
  };

  /** Prefer script origin; if scripts are on API :9090, also try web :9191 (same host). */
  const getEmbedOriginCandidates = () => {
    const candidates = [assetOrigin];
    const pushWebPort = (rawOrigin) => {
      try {
        const url = new URL(rawOrigin);
        if (url.port === '9090') {
          url.port = '9191';
          candidates.push(url.origin);
        }
      } catch (_) {
        /* ignore */
      }
    };
    pushWebPort(assetOrigin);
    try {
      pushWebPort(new URL(config.apiEndpoint).origin);
    } catch (_) {
      /* ignore */
    }
    return uniqueOrigins(candidates);
  };

  const applyIframeBox = (iframe, data) => {
    if (data && data.open) {
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      return;
    }
    const width = Math.max(64, Number(data && data.width) || 88);
    const height = Math.max(64, Number(data && data.height) || 88);
    const offsetX = Number(data && data.offsetX != null ? data.offsetX : config.widgetOffsetX) || 20;
    const offsetY = Number(data && data.offsetY != null ? data.offsetY : config.widgetBottomSpace) || 20;
    const position = (data && data.position) || config.position || 'bottom-right';
    iframe.style.top = 'auto';
    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;
    iframe.style.bottom = `${offsetY}px`;
    if (position === 'bottom-left') {
      iframe.style.left = `${offsetX}px`;
      iframe.style.right = 'auto';
    } else {
      iframe.style.right = `${offsetX}px`;
      iframe.style.left = 'auto';
    }
  };

  const buildEmbedUrl = (embedOrigin) => {
    const params = new URLSearchParams({
      projectId: String(config.projectId),
      apiEndpoint: String(config.apiEndpoint),
    });
    try {
      const hostSession = window.localStorage.getItem(`chat_widget_session_${config.projectId}`);
      if (hostSession && String(hostSession).trim()) {
        params.set('sessionId', String(hostSession).trim());
      }
    } catch (_) {
      /* ignore */
    }
    return `${embedOrigin}/embed/chatbot?${params.toString()}`;
  };

  /**
   * Mount AppChat iframe and wait for postMessage ready.
   * Avoids CORS-fragile fetch probes from third-party pages.
   * Iframe stays size-0 / hidden until resize (branded launcher) to avoid a gray box.
   */
  const tryMountAppChatIframe = (embedOrigin) =>
    new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.id = `ragsuite-chatbot-embed-${config.projectId}`;
      iframe.title = 'RAGSuite Assistant';
      iframe.setAttribute('allowtransparency', 'true');
      iframe.allow = 'clipboard-write';
      iframe.style.cssText = [
        'position:fixed',
        'border:0',
        'background:transparent',
        'color-scheme:none',
        'overflow:hidden',
        'opacity:0',
        'visibility:hidden',
        'pointer-events:none',
        'width:0',
        'height:0',
        'bottom:0',
        'right:0',
        `z-index:${config.zIndex || 99999}`,
      ].join(';');
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const revealIframe = () => {
        iframe.style.opacity = '1';
        iframe.style.visibility = 'visible';
        iframe.style.pointerEvents = 'auto';
        iframe.removeAttribute('aria-hidden');
      };

      let settled = false;
      const cleanupFailed = () => {
        window.removeEventListener('message', onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };

      const finish = (ok) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (!ok) {
          cleanupFailed();
          resolve(false);
          return;
        }
        window.RAGSuiteWidget = {
          init: function() { return true; },
          destroy: function() {
            window.removeEventListener('message', onMessage);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            delete window[perProjectLoaderKey];
          },
          version: 'appchat-embed',
        };
        resolve(true);
      };

      const onMessage = (event) => {
        if (event.origin !== embedOrigin) return;
        const data = event.data;
        if (!data || data.source !== EMBED_MESSAGE_SOURCE) return;
        if (data.type === 'ready') {
          // Hydrated — keep iframe hidden until resize (branded launcher).
          finish(true);
          return;
        }
        if (data.type === 'resize') {
          applyIframeBox(iframe, data);
          revealIframe();
        }
      };

      window.addEventListener('message', onMessage);
      const timer = window.setTimeout(() => finish(false), EMBED_READY_TIMEOUT_MS);
      iframe.src = buildEmbedUrl(embedOrigin);
    });

  const loadLegacyWidgetBundle = () => {
    if (window.__RAGSUITE_WIDGET_BUNDLE_PROMISE__) {
      return window.__RAGSUITE_WIDGET_BUNDLE_PROMISE__;
    }
    const pageOrigin = window.location.origin;
    const isThirdPartyEmbed = assetOrigin !== pageOrigin;

    const cssBase = isThirdPartyEmbed ? config.apiEndpoint : assetOrigin;
    const widgetCSS = document.createElement('link');
    widgetCSS.rel = 'stylesheet';
    widgetCSS.href = `${cssBase}/widget/${widgetVersion}/widget.css${cacheSuffix}`;
    document.head.appendChild(widgetCSS);

    const appendScript = (src) =>
      new Promise((resolve, reject) => {
        const widgetScript = document.createElement('script');
        widgetScript.src = src;
        widgetScript.async = true;
        widgetScript.onload = () => resolve(true);
        widgetScript.onerror = (err) => reject(err);
        document.head.appendChild(widgetScript);
      });

    const assetScriptUrl = `${assetOrigin}/widget/${widgetVersion}/widget.umd.js${cacheSuffix}`;
    const apiScriptUrl = `${config.apiEndpoint}/widget/${widgetVersion}/widget.umd.js${cacheSuffix}`;
    const primaryUrl = isThirdPartyEmbed ? apiScriptUrl : assetScriptUrl;
    const fallbackUrl = isThirdPartyEmbed ? assetScriptUrl : apiScriptUrl;

    window.__RAGSUITE_WIDGET_BUNDLE_PROMISE__ = appendScript(primaryUrl).catch(() =>
      appendScript(fallbackUrl),
    );
    return window.__RAGSUITE_WIDGET_BUNDLE_PROMISE__;
  };

  const initLegacyWidget = async () => {
    try {
      await loadLegacyWidgetBundle();
      if (window.RAGSuiteWidget && window.RAGSuiteWidget.init) {
        window.RAGSuiteWidget.init(config);
      } else {
        console.error('❌ RAG Suite: Widget bundle loaded but RAGSuiteWidget not found');
      }
    } catch (error) {
      console.error('❌ RAG Suite: Failed to initialize widget:', error);
    }
  };

  const initWidget = async () => {
    const embedOrigins = getEmbedOriginCandidates();
    for (let i = 0; i < embedOrigins.length; i += 1) {
      try {
        const mounted = await tryMountAppChatIframe(embedOrigins[i]);
        if (mounted) return;
      } catch (error) {
        console.warn('RAG Suite: AppChat embed candidate failed:', embedOrigins[i], error);
      }
    }
    console.warn('RAG Suite: AppChat embed unavailable, using legacy widget.');
    await initLegacyWidget();
  };

  initWidget();
})();
