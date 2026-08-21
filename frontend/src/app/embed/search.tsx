import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppSearchWidgetEmbedHost } from '@/features/app-search-widget/components/AppSearchWidgetEmbedHost';
import { AppSearchWidgetProvider } from '@/features/app-search-widget/providers/app-search-widget-provider';
import { EmbedActiveProjectProvider } from '@/features/projects/providers/active-project-provider';
import { configureRuntimeApiBaseUrlFromEndpoint } from '@/network/apiUrl';
import {
  configureEmbedWidgetAuth,
  resolveEmbedParentHostname,
} from '@/network/embed-widget-auth';
import { syncHttpClientBaseUrl } from '@/network/request';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return String(value ?? '').trim();
}

/**
 * Public third-party search embed surface.
 * Loaded by `/search-widget/v1/loader.js` inside an iframe — customer script URLs unchanged.
 */
export default function EmbedSearchPage() {
  const params = useLocalSearchParams<{
    projectId?: string | string[];
    apiEndpoint?: string | string[];
  }>();

  const projectId = firstParam(params.projectId);
  const apiEndpoint = firstParam(params.apiEndpoint);

  useEffect(() => {
    if (apiEndpoint) {
      configureRuntimeApiBaseUrlFromEndpoint(apiEndpoint);
      syncHttpClientBaseUrl();
    }
  }, [apiEndpoint]);

  useEffect(() => {
    if (!projectId) {
      configureEmbedWidgetAuth(null);
      return;
    }
    const parentHost = resolveEmbedParentHostname();
    if (parentHost) {
      configureEmbedWidgetAuth({ projectId, requestDomain: parentHost });
    } else {
      configureEmbedWidgetAuth({
        projectId,
        requestDomain: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
      });
    }
    return () => configureEmbedWidgetAuth(null);
  }, [projectId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage({ source: 'ragsuite-search-embed', type: 'ready' }, '*');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prev = {
      htmlBg: html.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
      htmlHeight: html.style.height,
      htmlMinHeight: html.style.minHeight,
      htmlOverflow: html.style.overflow,
      bodyHeight: body.style.height,
      bodyMinHeight: body.style.minHeight,
      bodyOverflow: body.style.overflow,
      rootHeight: root?.style.height ?? '',
      rootMinHeight: root?.style.minHeight ?? '',
      rootOverflow: root?.style.overflow ?? '',
    };
    html.style.backgroundColor = 'transparent';
    body.style.backgroundColor = 'transparent';
    html.style.height = 'auto';
    html.style.minHeight = '0';
    html.style.overflow = 'visible';
    body.style.height = 'auto';
    body.style.minHeight = '0';
    body.style.overflow = 'visible';
    if (root) {
      root.style.height = 'auto';
      root.style.minHeight = '0';
      root.style.overflow = 'visible';
    }
    return () => {
      html.style.backgroundColor = prev.htmlBg;
      body.style.backgroundColor = prev.bodyBg;
      html.style.height = prev.htmlHeight;
      html.style.minHeight = prev.htmlMinHeight;
      html.style.overflow = prev.htmlOverflow;
      body.style.height = prev.bodyHeight;
      body.style.minHeight = prev.bodyMinHeight;
      body.style.overflow = prev.bodyOverflow;
      if (root) {
        root.style.height = prev.rootHeight;
        root.style.minHeight = prev.rootMinHeight;
        root.style.overflow = prev.rootOverflow;
      }
    };
  }, []);

  const content = useMemo(() => {
    if (!projectId) {
      return <View style={styles.root} />;
    }
    return (
      <EmbedActiveProjectProvider projectId={projectId}>
        <AppSearchWidgetProvider>
          <View style={styles.root}>
            <AppSearchWidgetEmbedHost />
          </View>
        </AppSearchWidgetProvider>
      </EmbedActiveProjectProvider>
    );
  }, [projectId]);

  return content;
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});
