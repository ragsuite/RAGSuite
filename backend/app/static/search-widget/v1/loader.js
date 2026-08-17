/**
 * RAG SUITE SEARCH WIDGET LOADER (SINGLE PROJECT)
 * Prefer AppSearch via /embed/search iframe (same customer script URLs).
 * Legacy search-widget.umd.js is opt-in only (`data-legacy-widget="true"`).
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
      ':host,.ragsuite-search-widget-root,#ragsuite-search-widget-container{font-family:"Hanken Grotesk",-apple-system,"Segoe UI",Roboto,Arial,sans-serif!important;color:#1B1A17!important;}';
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
    console.error('❌ RAG Suite Search: Script tag not found.');
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
      console.warn('RAG Suite Search: Could not infer API endpoint from script src:', error);
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
  const EMBED_MESSAGE_SOURCE = 'ragsuite-search-embed';

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
    if (config.insertAfter && parent) {
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

  const tryMountAppSearchIframe = (embedOrigin, persistOnTimeout) =>
    new Promise((resolve) => {
      const mount = findMountNode();
      const iframe = document.createElement('iframe');
      iframe.id = `ragsuite-search-embed-${config.projectId}`;
      iframe.title = 'RAGSuite Search';
      iframe.setAttribute('allowtransparency', 'true');
      iframe.allow = 'clipboard-write';
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

      const bindHostApi = () => {
        window.RAGSuiteSearchWidget = {
          init: function() { return true; },
          destroy: function() {
            window.removeEventListener('message', onMessage);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            delete window[perProjectLoaderKey];
          },
          version: 'appsearch-embed',
        };
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
        bindHostApi();
        resolve(true);
      };

      const onMessage = (event) => {
        if (event.origin !== embedOrigin) return;
        const data = event.data;
        if (!data || data.source !== EMBED_MESSAGE_SOURCE) return;
        if (data.type === 'ready') {
          finish(true);
          return;
        }
        if (data.type === 'resize') {
          applyIframeBox(iframe, data);
          revealIframe();
        }
      };

      window.addEventListener('message', onMessage);
      const timer = window.setTimeout(() => {
        if (persistOnTimeout) {
          console.warn('RAG Suite Search: embed is still loading; keeping iframe (legacy widget disabled).');
          finish(true);
          return;
        }
        finish(false);
      }, EMBED_READY_TIMEOUT_MS);
      iframe.src = buildEmbedUrl(embedOrigin);
    });

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
    const embedOrigins = getEmbedOriginCandidates();
    for (let i = 0; i < embedOrigins.length; i += 1) {
      try {
        const persistOnTimeout = i === embedOrigins.length - 1;
        const mounted = await tryMountAppSearchIframe(embedOrigins[i], persistOnTimeout);
        if (mounted) return;
      } catch (error) {
        console.warn('RAG Suite Search: AppSearch embed candidate failed:', embedOrigins[i], error);
      }
    }
    console.error('RAG Suite Search: AppSearch embed unavailable. Set data-legacy-widget="true" only as an emergency fallback.');
  };

  initSearchWidget();
})();
