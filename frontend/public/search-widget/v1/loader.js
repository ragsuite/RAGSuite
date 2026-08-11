/**
 * RAG SUITE SEARCH WIDGET LOADER (SINGLE PROJECT)
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
  const DEV_PORTS = new Set(['3000', '5173', '5174', '5175', '6173']);
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
    if (DEV_PORTS.has(resolved.port || '')) {
      resolved.port = '9090';
      if (!resolved.pathname || resolved.pathname === '/') {
        resolved.pathname = '/api/v1';
      }
    }
    const scriptOrigin = getScriptOrigin();
    const scriptUrl = new URL(scriptOrigin, window.location.href);
    const looksPrivate = isPrivateOrLoopbackHost(resolved.hostname) || DEV_PORTS.has(resolved.port || '');
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
    primaryColor: scriptTag.getAttribute('data-primary-color') || windowConfig.primaryColor,
    title: scriptTag.getAttribute('data-title') || windowConfig.title,
    welcomeMessage: scriptTag.getAttribute('data-welcome-message') || windowConfig.welcomeMessage,
    orgName: scriptTag.getAttribute('data-org-name') || windowConfig.orgName,
    searchTitle: scriptTag.getAttribute('data-search-title') || windowConfig.searchTitle,
    widgetLogoUrl: scriptTag.getAttribute('data-widget-logo-url') || windowConfig.widgetLogoUrl,
    widgetAvatar: scriptTag.getAttribute('data-widget-avatar') || windowConfig.widgetAvatar,
    widgetShowLogo: scriptTag.getAttribute('data-widget-show-logo') === 'true' || windowConfig.widgetShowLogo,
    widgetShowDateTime: scriptTag.getAttribute('data-widget-show-datetime') === 'true' || windowConfig.widgetShowDateTime,
    widgetBottomSpace: parseInt(scriptTag.getAttribute('data-widget-bottom-space') || String(windowConfig.widgetBottomSpace || 15), 10),
    widgetFontSize: parseInt(scriptTag.getAttribute('data-widget-font-size') || String(windowConfig.widgetFontSize || 16), 10),
    widgetTriggerBorderRadius: parseInt(scriptTag.getAttribute('data-widget-trigger-border-radius') || String(windowConfig.widgetTriggerBorderRadius || 50), 10),
    widgetOffsetX: parseInt(scriptTag.getAttribute('data-widget-offset-x') || String(windowConfig.widgetOffsetX || 20), 10),
    widgetOffsetY: parseInt(scriptTag.getAttribute('data-widget-offset-y') || String(windowConfig.widgetOffsetY || 20), 10),
    insertAfter: scriptTag.getAttribute('data-insert-after') === 'true' || windowConfig.insertAfter || true,
    containerSelector: scriptTag.getAttribute('data-container') || windowConfig.containerSelector || null,
  };

  if (!config.projectId) {
    console.error('❌ RAG Suite Search: projectId is required.');
    return;
  }

  const perProjectLoaderKey = `__RAGSUITE_SEARCH_LOADER_${config.projectId}__`;
  if (window[perProjectLoaderKey]) return;
  window[perProjectLoaderKey] = true;

  const loadSearchBundle = () => {
    if (window.__RAGSUITE_SEARCH_BUNDLE_PROMISE__) {
      return window.__RAGSUITE_SEARCH_BUNDLE_PROMISE__;
    }
    const assetOrigin = getScriptOrigin();
    const pageOrigin = window.location.origin;
    const isThirdPartyEmbed = assetOrigin !== pageOrigin;
    window.RAGSUITE_SEARCH_WIDGET_ASSET_ORIGIN = assetOrigin;
    window.RAGSUITE_ASSET_ORIGIN = assetOrigin;

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

  const initSearchWidget = async () => {
    try {
      await loadSearchBundle();
      if (window.RAGSuiteSearchWidget && window.RAGSuiteSearchWidget.init) {
        window.RAGSuiteSearchWidget.init(config);
      } else {
        console.error('❌ RAG Suite Search: Bundle loaded but widget API not found');
      }
    } catch (error) {
      console.error('❌ RAG Suite Search: Failed to initialize:', error);
    }
  };

  initSearchWidget();
})();
