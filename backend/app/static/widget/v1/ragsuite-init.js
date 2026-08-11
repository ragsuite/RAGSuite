/**
 * RAG SUITE INIT SCRIPT (SINGLE PROJECT)
 *
 * Loads chatbot/search loader for one explicit project ID.
 */
(function() {
  'use strict';

  const scriptTag = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.includes('ragsuite-init.js')) {
        return scripts[i];
      }
    }
    return null;
  })();

  if (!scriptTag) {
    console.error('❌ RAG Suite: Init script tag not found');
    return;
  }

  const windowConfig = window.ragSuiteInitConfig || {};
  const projectId = scriptTag.getAttribute('data-ragsuite-project-id') || windowConfig.projectId;
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
  const explicitApiEndpoint = scriptTag.getAttribute('data-api-endpoint') || windowConfig.apiEndpoint;
  const apiEndpoint = resolveApiEndpoint(explicitApiEndpoint);
  const widgetVersion = scriptTag.getAttribute('data-version') || 'v1';
  const cacheBustValue = scriptTag.getAttribute('data-cache-bust') ||
    window.__RAGSUITE_BUILD_ID__ ||
    '20260604';

  const scriptSrc = scriptTag.src || '';
  const isSearchWidgetPath = scriptSrc.includes('/search-widget/');
  const widgetType = isSearchWidgetPath ? 'search' : 'chatbot';

  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    console.error('❌ RAG Suite: No project ID provided. Please add data-ragsuite-project-id.');
    return;
  }

  const normalizedProjectId = projectId.trim();
  const executedKey = `__RAGSUITE_INIT_EXECUTED_${widgetType}_${normalizedProjectId}__`;
  const scriptPathPattern = widgetType === 'search' ? '/search-widget/' : '/widget/';
  const scriptStillInDOM = document.querySelector(
    `script[data-ragsuite-project-id="${normalizedProjectId}"][src*="${scriptPathPattern}"]`
  );

  if (window[executedKey] && scriptStillInDOM) return;
  if (window[executedKey] && !scriptStillInDOM) delete window[executedKey];
  window[executedKey] = true;

  const injectChatbotLoaderScript = (resolvedProjectId) => {
    const existing = document.querySelectorAll(
      `script[data-ragsuite-project-id="${resolvedProjectId}"][data-widget-type="chatbot"]`
    );
    if (existing.length > 0) return;
    const assetOrigin = getScriptOrigin();
    const loaderScript = document.createElement('script');
    loaderScript.src = `${assetOrigin}/widget/${widgetVersion}/loader.js?v=${cacheBustValue}`;
    loaderScript.setAttribute('data-ragsuite-project-id', resolvedProjectId);
    loaderScript.setAttribute('data-widget-type', 'chatbot');
    loaderScript.setAttribute('data-api-endpoint', apiEndpoint);
    loaderScript.setAttribute('data-position', 'bottom-right');
    loaderScript.setAttribute('data-cache-bust', cacheBustValue);
    loaderScript.defer = true;
    (document.head || document.body || document.documentElement).appendChild(loaderScript);
  };

  const injectSearchLoaderScript = (resolvedProjectId) => {
    const existing = document.querySelectorAll(
      `script[data-ragsuite-project-id="${resolvedProjectId}"][data-widget-type="search"]`
    );
    if (existing.length > 0) return;
    const assetOrigin = getScriptOrigin();
    const loaderScript = document.createElement('script');
    loaderScript.src = `${assetOrigin}/search-widget/${widgetVersion}/loader.js?v=${cacheBustValue}`;
    loaderScript.setAttribute('data-ragsuite-project-id', resolvedProjectId);
    loaderScript.setAttribute('data-widget-type', 'search');
    loaderScript.setAttribute('data-api-endpoint', apiEndpoint);
    loaderScript.setAttribute('data-cache-bust', cacheBustValue);
    loaderScript.defer = true;
    (document.head || document.body || document.documentElement).appendChild(loaderScript);
  };

  const init = async () => {
    window.RAGSUITE_ASSET_ORIGIN = getScriptOrigin();
    window.RAGSUITE_SEARCH_WIDGET_ASSET_ORIGIN = getScriptOrigin();
    if (widgetType === 'chatbot') {
      injectChatbotLoaderScript(normalizedProjectId);
    } else {
      injectSearchLoaderScript(normalizedProjectId);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
