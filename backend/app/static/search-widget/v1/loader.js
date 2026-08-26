/**
 * RAG SUITE SEARCH WIDGET LOADER (SINGLE PROJECT)
 * Prefer AppSearch via /embed/search iframe (same customer script URLs).
 * Legacy search-widget.umd.js is opt-in only (`data-legacy-widget="true"`).
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
    console.error('❌ RAG Suite Search: Script tag not found.');
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
      console.warn('RAG Suite Search: Could not infer API endpoint from script src:', error);
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
  const windowConfig = window.ragSuiteSearchConfig || {};
  const cacheBustValue = scriptTag.getAttribute('data-cache-bust') ||
    window.__RAGSUITE_BUILD_ID__ || Date.now().toString();
  const cacheSuffix = cacheBustValue ? `?v=${encodeURIComponent(cacheBustValue)}` : '';

  const config = {
    projectId: projectId || windowConfig.projectId,
    apiEndpoint: resolveApiEndpoint(windowConfig.apiEndpoint || apiEndpoint),
    position: 'inline',
    zIndex: parseInt(scriptTag.getAttribute('data-z-index') || String(windowConfig.zIndex || 1), 10),
    insertAfter: scriptTag.getAttribute('data-insert-after') === 'false' ? false : (windowConfig.insertAfter !== false),
    containerSelector: scriptTag.getAttribute('data-container') || windowConfig.containerSelector || null,
  };

  if (!config.projectId) {
    console.error('❌ RAG Suite Search: projectId is required.');
    return;
  }

  const perProjectLoaderKey = `__RAGSUITE_SEARCH_LOADER_${config.projectId}__`;
  if (window[perProjectLoaderKey]) return;
  window[perProjectLoaderKey] = true;

  const assetOrigin = getScriptOrigin();
  window.RAGSUITE_SEARCH_WIDGET_ASSET_ORIGIN = assetOrigin;
  window.RAGSUITE_ASSET_ORIGIN = assetOrigin;
  const EMBED_READY_TIMEOUT_MS = 12000;
  const EMBED_RESIZE_FALLBACK_MS = 2000;
  const EMBED_MESSAGE_SOURCE = 'ragsuite-search-embed';
  const DEFAULT_SEARCH_HEIGHT = 88;

  const uniqueOrigins = (origins) => {
    const out = [];
    origins.forEach((origin) => {
      if (origin && out.indexOf(origin) === -1) out.push(origin);
    });
    return out;
  };

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

  const isSafeBodyMountParent = (parent) => {
    if (!parent || parent === document.head || parent === document.documentElement) return false;
    if (parent === document.body) return true;
    return !!(document.body && document.body.contains(parent));
  };

  const findMountNode = () => {
    if (config.containerSelector) {
      const selected = document.querySelector(config.containerSelector);
      if (selected) return selected;
    }
    let el = document.getElementById('ragsuite-search-widget-container');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'ragsuite-search-widget-container';
    el.className = 'ragsuite-search-widget-root';
    const parent = scriptTag.parentNode;
    if (config.insertAfter && isSafeBodyMountParent(parent)) {
      parent.insertBefore(el, scriptTag.nextSibling);
    } else {
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  };

  const applyIframeBox = (iframe, data) => {
    const height = Math.max(72, Number(data && data.height) || 88);
    iframe.style.width = '100%';
    iframe.style.height = `${height}px`;
  };

  const buildEmbedUrl = (embedOrigin) => {
    const params = new URLSearchParams({
      projectId: String(config.projectId),
      apiEndpoint: String(config.apiEndpoint),
    });
    return `${embedOrigin}/embed/search?${params.toString()}`;
  };

  const tryMountAppSearchIframe = (embedOrigin, options) =>
    new Promise((resolve) => {
      const keepOnFailure = Boolean(options && options.keepOnFailure);
      const mount = findMountNode();
      const iframe = document.createElement('iframe');
      iframe.id = `ragsuite-search-embed-${config.projectId}`;
      iframe.title = 'RAGSuite Search';
      iframe.setAttribute('allowtransparency', 'true');
      iframe.allow = 'clipboard-write; microphone';
      iframe.style.cssText = [
        'display:block',
        'width:100%',
        'min-height:72px',
        'height:72px',
        'border:0',
        'background:transparent',
        'color-scheme:none',
        'overflow:hidden',
        'opacity:0',
        'visibility:hidden',
        'pointer-events:none',
        `z-index:${config.zIndex || 1}`,
      ].join(';');
      iframe.setAttribute('aria-hidden', 'true');
      mount.appendChild(iframe);

      let gotReady = false;
      let revealed = false;
      let resizeFallbackTimer = null;

      const revealIframe = () => {
        iframe.style.opacity = '1';
        iframe.style.visibility = 'visible';
        iframe.style.pointerEvents = 'auto';
        iframe.removeAttribute('aria-hidden');
        revealed = true;
      };

      const revealDefaultSearchBox = () => {
        if (revealed) return;
        applyIframeBox(iframe, { height: DEFAULT_SEARCH_HEIGHT });
        revealIframe();
      };

      const clearResizeFallback = () => {
        if (resizeFallbackTimer) {
          window.clearTimeout(resizeFallbackTimer);
          resizeFallbackTimer = null;
        }
      };

      let settled = false;
      let failReason = 'no-ready';
      const cleanupFailed = () => {
        clearResizeFallback();
        window.removeEventListener('message', onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };
      const keepFailedIframe = () => {
        clearResizeFallback();
      };

      const bindHostApi = () => {
        const mountTo = (selector) => {
          const sel = String(selector || '').trim();
          if (!sel) return false;
          const target = document.querySelector(sel);
          if (!target || !isSafeBodyMountParent(target)) return false;
          if (iframe.parentNode === target) {
            config.containerSelector = sel;
            return true;
          }
          target.appendChild(iframe);
          config.containerSelector = sel;
          return true;
        };

        const onHostMountMessage = (event) => {
          if (event.source !== window) return;
          const data = event.data;
          if (!data || data.source !== 'ragsuite-search-host' || data.type !== 'mountTo') return;
          mountTo(data.selector);
        };
        window.addEventListener('message', onHostMountMessage);

        window.RAGSuiteSearchWidget = {
          init: function() { return true; },
          mountTo: mountTo,
          destroy: function() {
            clearResizeFallback();
            window.removeEventListener('message', onMessage);
            window.removeEventListener('message', onHostMountMessage);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            delete window[perProjectLoaderKey];
          },
          version: 'appsearch-embed',
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
          resizeFallbackTimer = window.setTimeout(revealDefaultSearchBox, EMBED_RESIZE_FALLBACK_MS);
          return;
        }
        if (data.type === 'hidden') {
          if (data.reason === 'inactive') {
            finish(true);
            cleanupFailed();
            return;
          }
          if (data.reason === 'unauthorized-origin') {
            console.error(
              'RAG Suite Search: embed refused for this page origin (' +
                window.location.origin +
                '). Add a public https origin to Allowed Domains. ' +
                'Localhost/loopback cannot frame the production embed (frame-ancestors).',
            );
            finish(false, 'unauthorized-origin');
            return;
          }
          finish(false, 'hidden');
          return;
        }
        if (data.type === 'resize') {
          clearResizeFallback();
          applyIframeBox(iframe, data);
          revealIframe();
          if (!settled) finish(true);
        }
      };

      window.addEventListener('message', onMessage);
      const timer = window.setTimeout(() => {
        if (gotReady) {
          revealDefaultSearchBox();
          finish(true);
          return;
        }
        try {
          const host = window.location.hostname || '';
          if (isPrivateOrLoopbackHost(host)) {
            console.error(
              'RAG Suite Search: embed did not become ready for origin ' +
                window.location.origin +
                ' (reason=unauthorized-origin). ' +
                'Localhost/loopback are not allowed as frame-ancestors. ' +
                'Use a public https Allowed Domain, or open the embed URL standalone for local testing.',
            );
            finish(false, 'unauthorized-origin');
            return;
          }
        } catch (_) {
          /* ignore */
        }
        finish(false, 'timeout-no-ready');
      }, EMBED_READY_TIMEOUT_MS);
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
      'RAG Suite Search: CSP blocked the AppSearch iframe (' +
        directive +
        ', blockedURI=' +
        (event.blockedURI || '') +
        '). If this site sends Content-Security-Policy, allow the RAGSuite origin in frame-src. ' +
        'If the embed host sends frame-ancestors, add this page origin to Allowed Domains. ' +
        'Do not set data-legacy-widget unless you intentionally want the old UMD widget.',
    );
  };

  const loadLegacySearchBundle = () => {
    if (window.__RAGSUITE_SEARCH_BUNDLE_PROMISE__) {
      return window.__RAGSUITE_SEARCH_BUNDLE_PROMISE__;
    }
    const pageOrigin = window.location.origin;
    const isThirdPartyEmbed = assetOrigin !== pageOrigin;

    const cssBase = isThirdPartyEmbed ? config.apiEndpoint : assetOrigin;
    const widgetCSS = document.createElement('link');
    widgetCSS.rel = 'stylesheet';
    widgetCSS.href = `${cssBase}/search-widget/${widgetVersion}/search-widget.css${cacheSuffix}`;
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

    const assetScriptUrl = `${assetOrigin}/search-widget/${widgetVersion}/search-widget.umd.js${cacheSuffix}`;
    const apiScriptUrl = `${config.apiEndpoint}/search-widget/${widgetVersion}/search-widget.umd.js${cacheSuffix}`;
    const primaryUrl = isThirdPartyEmbed ? apiScriptUrl : assetScriptUrl;
    const fallbackUrl = isThirdPartyEmbed ? assetScriptUrl : apiScriptUrl;

    window.__RAGSUITE_SEARCH_BUNDLE_PROMISE__ = appendScript(primaryUrl).catch(() =>
      appendScript(fallbackUrl),
    );
    return window.__RAGSUITE_SEARCH_BUNDLE_PROMISE__;
  };

  const initLegacyWidget = async () => {
    try {
      await loadLegacySearchBundle();
      if (window.RAGSuiteSearchWidget && window.RAGSuiteSearchWidget.init) {
        window.RAGSuiteSearchWidget.init(config);
      } else {
        console.error('❌ RAG Suite Search: Bundle loaded but widget API not found');
      }
    } catch (error) {
      console.error('❌ RAG Suite Search: Failed to initialize:', error);
    }
  };

  const useLegacyWidget =
    scriptTag.getAttribute('data-legacy-widget') === 'true' ||
    windowConfig.useLegacyWidget === true;

  const initSearchWidget = async () => {
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
        const result = await tryMountAppSearchIframe(embedOrigins[i], { keepOnFailure: isLast });
        if (result && result.ok) return;
        if (result && result.reason) lastFailReason = result.reason;
      } catch (error) {
        lastFailReason = 'no-ready';
        console.warn('RAG Suite Search: AppSearch embed candidate failed:', embedOrigins[i], error);
      }
    }
    console.warn(
      'RAG Suite Search: AppSearch embed unavailable (reason=' +
        lastFailReason +
        '). Keeping the iframe; not loading the legacy UMD widget. ' +
        'If you re-parent, move the search host root — never the inner iframe alone. ' +
        'Avoid display:none ancestors. ' +
        'Set data-legacy-widget="true" only if you intentionally need the old widget.',
    );
  };

  initSearchWidget();
})();
