/**
 * RAG SUITE WIDGET LOADER (SINGLE PROJECT)
 * Prefer AppChatWidget via /embed/chatbot iframe (same customer script URLs).
 * Legacy widget.umd.js is opt-in only (`data-legacy-widget="true"`).
 */
(function() {
  'use strict';

  // Do not fetch Google Fonts (or any third-party webfonts) on the host page.
  // Embed UIs live in cross-origin iframes and do not inherit host typography;
  // a fonts.googleapis.com request would phone home on every customer site.

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
  const ensureAbsoluteHttpUrl = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith('//')) {
      return value.replace(/\/+$/, '');
    }
    return `https://${value.replace(/^\/+/, '')}`.replace(/\/+$/, '');
  };
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
      if (!scriptSrc) return window.location.origin;
      const absoluteSrc = ensureAbsoluteHttpUrl(scriptSrc) || scriptSrc;
      return new URL(absoluteSrc, window.location.href).origin;
    } catch {
      return window.location.origin;
    }
  };
  const getDefaultApiEndpoint = () => {
    try {
      const scriptSrc = scriptTag.getAttribute('src') || scriptTag.src;
      if (scriptSrc) {
        const absoluteSrc = ensureAbsoluteHttpUrl(scriptSrc) || scriptSrc;
        const scriptUrl = new URL(absoluteSrc, window.location.href);
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
      const candidate = String(raw || '').trim();
      const absoluteCandidate = candidate
        ? (ensureAbsoluteHttpUrl(candidate) || candidate)
        : fallbackUrl.toString();
      resolved = new URL(absoluteCandidate, window.location.href);
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
  const EMBED_RESIZE_FALLBACK_MS = 2000;
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

  const applyShellBox = (shell, iframe, data) => {
    const isOpen = Boolean(data && data.open);
    const useFullscreenCover = isOpen && data && data.cover === true;
    const rawScale = Number(data && data.shellScale);
    const shellScale =
      Number.isFinite(rawScale) && rawScale > 0 ? Math.min(1, rawScale) : 1;
    const transformOrigin =
      (data && data.transformOrigin) === 'bottom left' ? 'bottom left' : 'bottom right';

    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.background = 'transparent';
    iframe.style.colorScheme = 'none';
    iframe.style.overflow = 'hidden';

    if (useFullscreenCover) {
      shell.style.top = '0';
      shell.style.left = '0';
      shell.style.right = '0';
      shell.style.bottom = '0';
      shell.style.width = 'auto';
      shell.style.height = 'auto';
      shell.style.transform = 'none';
      shell.style.transformOrigin = '';
      return;
    }

    const width = Math.max(64, Number(data && data.width) || 88);
    const height = Math.max(64, Number(data && data.height) || 88);
    const offsetX = Number(data && data.offsetX != null ? data.offsetX : config.widgetOffsetX) || 20;
    const offsetY = Number(data && data.offsetY != null ? data.offsetY : config.widgetBottomSpace) || 20;
    const position = (data && data.position) || config.position || 'bottom-right';
    shell.style.top = 'auto';
    shell.style.width = `${width}px`;
    shell.style.height = `${height}px`;
    shell.style.bottom = `${offsetY}px`;
    if (position === 'bottom-left') {
      shell.style.left = `${offsetX}px`;
      shell.style.right = 'auto';
    } else {
      shell.style.right = `${offsetX}px`;
      shell.style.left = 'auto';
    }
    shell.style.transformOrigin = transformOrigin;
    // Instant size; scale only via transform (SalesIQ-style corner grow).
    shell.style.transform = shellScale < 0.999 ? `scale(${shellScale})` : 'none';
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
   * Mount AppChat iframe and wait for postMessage ready + resize.
   * Legacy UMD is opt-in only (`data-legacy-widget="true"`).
   */
  const tryMountAppChatIframe = (embedOrigin, options) =>
    new Promise((resolve) => {
      const keepOnFailure = Boolean(options && options.keepOnFailure);
      const shell = document.createElement('div');
      shell.id = `ragsuite-chatbot-shell-${config.projectId}`;
      shell.style.cssText = [
        'position:fixed',
        'border:0',
        'background:transparent',
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

      const iframe = document.createElement('iframe');
      iframe.id = `ragsuite-chatbot-embed-${config.projectId}`;
      iframe.title = 'RAGSuite Assistant';
      iframe.setAttribute('allowtransparency', 'true');
      iframe.allow = 'clipboard-write; microphone';
      iframe.style.cssText = [
        'position:absolute',
        'inset:0',
        'width:100%',
        'height:100%',
        'border:0',
        'background:transparent',
        'color-scheme:none',
        'overflow:hidden',
      ].join(';');
      iframe.setAttribute('aria-hidden', 'true');
      shell.appendChild(iframe);
      document.body.appendChild(shell);

      let gotReady = false;
      let revealed = false;
      let resizeFallbackTimer = null;

      const revealShell = () => {
        shell.style.opacity = '1';
        shell.style.visibility = 'visible';
        shell.style.pointerEvents = 'auto';
        iframe.style.pointerEvents = 'auto';
        iframe.removeAttribute('aria-hidden');
        revealed = true;
      };

      const revealDefaultLauncher = () => {
        if (revealed) return;
        applyShellBox(shell, iframe, {
          width: 88,
          height: 88,
          offsetX: config.widgetOffsetX,
          offsetY: config.widgetBottomSpace,
          position: config.position,
          open: false,
          shellScale: 1,
        });
        revealShell();
      };

      const clearResizeFallback = () => {
        if (resizeFallbackTimer) {
          window.clearTimeout(resizeFallbackTimer);
          resizeFallbackTimer = null;
        }
      };

      let settled = false;
      let failReason = 'no-ready';
      const removeShell = () => {
        if (shell.parentNode) shell.parentNode.removeChild(shell);
      };
      const cleanupFailed = () => {
        detachHostViewport();
        clearResizeFallback();
        window.removeEventListener('message', onMessage);
        removeShell();
      };
      const keepFailedIframe = () => {
        clearResizeFallback();
      };

      const postHostViewport = () => {
        const target = iframe.contentWindow;
        if (!target) return;
        try {
          target.postMessage(
            {
              source: 'ragsuite-chatbot-host',
              type: 'viewport',
              width: window.innerWidth,
              height: window.innerHeight,
            },
            embedOrigin,
          );
        } catch (_) {
          /* ignore */
        }
      };

      const onHostViewportChange = () => postHostViewport();
      window.addEventListener('resize', onHostViewportChange);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onHostViewportChange);
      }

      const detachHostViewport = () => {
        window.removeEventListener('resize', onHostViewportChange);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', onHostViewportChange);
        }
      };

      const bindHostApi = () => {
        window.RAGSuiteWidget = {
          init: function() { return true; },
          destroy: function() {
            detachHostViewport();
            clearResizeFallback();
            window.removeEventListener('message', onMessage);
            removeShell();
            delete window[perProjectLoaderKey];
          },
          version: 'appchat-embed',
        };
      };

      const finish = (ok, reason) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        clearResizeFallback();
        if (!ok) {
          if (reason) failReason = reason;
          if (keepOnFailure) keepFailedIframe();
          else cleanupFailed();
          resolve({ ok: false, reason: failReason });
          return;
        }
        bindHostApi();
        resolve({ ok: true });
      };

      const onMessage = (event) => {
        if (event.origin !== embedOrigin) return;
        const data = event.data;
        if (!data || data.source !== EMBED_MESSAGE_SOURCE) return;
        if (data.type === 'ready') {
          gotReady = true;
          postHostViewport();
          resizeFallbackTimer = window.setTimeout(revealDefaultLauncher, EMBED_RESIZE_FALLBACK_MS);
          return;
        }
        if (data.type === 'hidden') {
          if (data.reason === 'inactive') {
            finish(true);
            cleanupFailed();
            return;
          }
          finish(false, 'hidden');
          return;
        }
        if (data.type === 'resize') {
          clearResizeFallback();
          applyShellBox(shell, iframe, data);
          revealShell();
          if (!settled) finish(true);
        }
      };

      window.addEventListener('message', onMessage);
      const timer = window.setTimeout(() => {
        if (gotReady) {
          revealDefaultLauncher();
          finish(true);
          return;
        }
        finish(false, 'timeout-no-ready');
      }, EMBED_READY_TIMEOUT_MS);
      iframe.addEventListener('load', postHostViewport);
      iframe.src = buildEmbedUrl(embedOrigin);
    });

  const logEmbedCspViolation = (event) => {
    const directive = String(event.effectiveDirective || event.violatedDirective || '');
    if (
      directive.indexOf('frame-src') === -1 &&
      directive.indexOf('frame-ancestors') === -1 &&
      directive.indexOf('child-src') === -1
    ) {
      return;
    }
    console.warn(
      'RAG Suite: CSP blocked the AppChat iframe (' +
        directive +
        ', blockedURI=' +
        (event.blockedURI || '') +
        '). If this site sends Content-Security-Policy, allow the RAGSuite origin in frame-src. ' +
        'If the embed host sends frame-ancestors, add this page origin to Allowed Domains. ' +
        'Do not set data-legacy-widget unless you intentionally want the old UMD widget.',
    );
  };

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

  const useLegacyWidget =
    scriptTag.getAttribute('data-legacy-widget') === 'true' ||
    windowConfig.useLegacyWidget === true;

  const initWidget = async () => {
    if (useLegacyWidget) {
      await initLegacyWidget();
      return;
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('securitypolicyviolation', logEmbedCspViolation);
    }
    const embedOrigins = getEmbedOriginCandidates();
    let lastFailReason = 'no-ready';
    for (let i = 0; i < embedOrigins.length; i += 1) {
      const isLast = i === embedOrigins.length - 1;
      try {
        const result = await tryMountAppChatIframe(embedOrigins[i], { keepOnFailure: isLast });
        if (result && result.ok) return;
        if (result && result.reason) lastFailReason = result.reason;
      } catch (error) {
        lastFailReason = 'no-ready';
        console.warn('RAG Suite: AppChat embed candidate failed:', embedOrigins[i], error);
      }
    }
    console.warn(
      'RAG Suite: AppChat embed unavailable (reason=' +
        lastFailReason +
        '). Keeping the iframe; not loading the legacy UMD widget. ' +
        'Do not re-parent the iframe during handshake; avoid display:none ancestors. ' +
        'Set data-legacy-widget="true" only if you intentionally need the old widget.',
    );
  };

  initWidget();
})();
