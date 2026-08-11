import axios, { type AxiosError, type AxiosRequestConfig, CanceledError } from 'axios';
import { Platform } from 'react-native';

import {
  clearAuthSession,
  getAccessToken,
  isAuthBootstrapping,
  isWebCookieSessionActive,
} from '@/network/auth-session';
import { notifyUnauthorized } from '@/network/auth-events';
import { notifyApiReachable, notifyApiUnreachable } from '@/network/api-reachability';
import { API_CONFIG, buildApiUrl } from '@/network/apiUrl';
import { getEmbedWidgetAuthHeaders } from '@/network/embed-widget-auth';
import type { ErrorResponse, SuccessResponse } from '@/types/api.types';
import {
  COMMON_ERROR_RESPONSE,
  extractApiErrorMessage,
  isUnauthorizedStatus,
} from '@/utils/api-error';

export type RequestConfig = AxiosRequestConfig & {
  skipAuth?: boolean;
  /** Skip marking the API as unreachable (health probes / background pings). */
  skipReachability?: boolean;
};

const httpClient = axios.create({
  timeout: 30_000,
  baseURL: API_CONFIG.BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Web: send cookies for SSO dual-auth; native Bearer-only (cookies unused).
  withCredentials: Platform.OS === 'web',
});

/** Keep axios baseURL in sync when embed configures a runtime API host. */
export function syncHttpClientBaseUrl(): void {
  httpClient.defaults.baseURL = API_CONFIG.BASE_URL;
}

/** Reference parity: log unreachable host once per outage (avoids Expo LogBox spam). */
let hasLoggedNetworkUnreachable = false;

httpClient.interceptors.request.use((config) => {
  const requestConfig = config as RequestConfig;
  const hasAuthorization = Boolean(config.headers?.Authorization);

  config.headers['ngrok-skip-browser-warning'] = 'true';

  const embedHeaders = getEmbedWidgetAuthHeaders();
  for (const [key, value] of Object.entries(embedHeaders)) {
    if (!config.headers[key]) {
      config.headers[key] = value;
    }
  }

  if (!requestConfig.skipAuth && !hasAuthorization) {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

httpClient.interceptors.response.use(
  (response) => {
    const requestConfig = response.config as RequestConfig;
    if (!requestConfig.skipReachability) {
      hasLoggedNetworkUnreachable = false;
      notifyApiReachable();
    }
    return response;
  },
  async (error: AxiosError<ErrorResponse>) => {
    const requestConfig = (error.config ?? {}) as RequestConfig;
    if (!requestConfig.skipReachability && !error.response) {
      // Do not use console.error — Expo LogBox treats it as a redbox and every
      // parallel request would spam. UX is handled by ApiUnavailableOverlay.
      if (__DEV__ && !hasLoggedNetworkUnreachable) {
        hasLoggedNetworkUnreachable = true;
        console.warn(
          `[network] Cannot reach API at ${API_CONFIG.BASE_URL}. Showing unavailable UI until the server responds.`,
        );
      }
      notifyApiUnreachable();
    }

    if (isUnauthorizedStatus(error.response?.status)) {
      const hadAuthHeader = Boolean(error.config?.headers?.Authorization);
      const cookieSession = isWebCookieSessionActive();
      if ((hadAuthHeader || cookieSession) && !isAuthBootstrapping()) {
        await clearAuthSession();
        notifyUnauthorized();
      }
    }
    return Promise.reject(error);
  },
);

function isSuccessStatus(status: number): boolean {
  return status === 200 || status === 201 || status === 202 || status === 204;
}

async function handleApiError(error: unknown): Promise<never> {
  if (error instanceof CanceledError || axios.isCancel(error)) {
    throw error;
  }

  const axiosError = error as AxiosError<ErrorResponse>;
  if (!axiosError.response) {
    throw new Error('errors.network.noResponse');
  }

  const requestError = new Error(
    extractApiErrorMessage(axiosError.response.data, COMMON_ERROR_RESPONSE.message),
  ) as Error & { status?: number };
  requestError.status = axiosError.response.status;
  throw requestError;
}

export async function get<T>(
  path: string,
  config?: RequestConfig,
): Promise<SuccessResponse<T> | ErrorResponse | T> {
  try {
    const response = await httpClient.get<T | SuccessResponse<T>>(buildApiUrl(path), config);
    if (isSuccessStatus(response.status)) {
      return response.data;
    }
    return COMMON_ERROR_RESPONSE;
  } catch (error) {
    await handleApiError(error);
    return COMMON_ERROR_RESPONSE;
  }
}

export async function post<TBody, TResponse = TBody>(
  path: string,
  body?: TBody,
  config?: RequestConfig,
): Promise<SuccessResponse<TResponse> | ErrorResponse | TResponse> {
  try {
    const response = await httpClient.post<TResponse | SuccessResponse<TResponse>>(buildApiUrl(path), body, config);
    if (isSuccessStatus(response.status)) {
      return response.data;
    }
    return COMMON_ERROR_RESPONSE;
  } catch (error) {
    await handleApiError(error);
    return COMMON_ERROR_RESPONSE;
  }
}

export async function put<TBody, TResponse = TBody>(
  path: string,
  body?: TBody,
  config?: RequestConfig,
): Promise<SuccessResponse<TResponse> | ErrorResponse | TResponse> {
  try {
    const response = await httpClient.put<TResponse | SuccessResponse<TResponse>>(buildApiUrl(path), body, config);
    if (isSuccessStatus(response.status)) {
      return response.data;
    }
    return COMMON_ERROR_RESPONSE;
  } catch (error) {
    await handleApiError(error);
    return COMMON_ERROR_RESPONSE;
  }
}

export async function patch<TBody, TResponse = TBody>(
  path: string,
  body?: TBody,
  config?: RequestConfig,
): Promise<SuccessResponse<TResponse> | ErrorResponse | TResponse> {
  try {
    const response = await httpClient.patch<TResponse | SuccessResponse<TResponse>>(buildApiUrl(path), body, config);
    if (isSuccessStatus(response.status)) {
      return response.data;
    }
    return COMMON_ERROR_RESPONSE;
  } catch (error) {
    await handleApiError(error);
    return COMMON_ERROR_RESPONSE;
  }
}

export async function deleteApi<TResponse = void>(
  path: string,
  config?: RequestConfig,
): Promise<SuccessResponse<TResponse> | ErrorResponse | TResponse> {
  try {
    const response = await httpClient.delete<TResponse | SuccessResponse<TResponse>>(buildApiUrl(path), config);
    return response.data;
  } catch (error) {
    await handleApiError(error);
    return COMMON_ERROR_RESPONSE;
  }
}

export function getAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...getEmbedWidgetAuthHeaders(),
    ...extraHeaders,
  };

  if (!headers.Authorization) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
}

export async function fetchWithAuth(path: string, init?: RequestInit): Promise<Response> {
  const headers = getAuthHeaders(
    init?.headers ? (init.headers as Record<string, string>) : undefined,
  );

  return fetch(buildApiUrl(path), {
    ...init,
    headers,
    credentials: Platform.OS === 'web' ? 'include' : init?.credentials,
  });
}

export type TextResponse = {
  body: string;
  contentType: string | null;
  contentDisposition: string | null;
};

/** Authenticated GET that returns raw text (exports, downloads). */
export async function getText(path: string, config?: RequestConfig): Promise<TextResponse> {
  try {
    const response = await httpClient.get<string>(buildApiUrl(path), {
      ...config,
      responseType: 'text',
      transformResponse: [(data) => data],
      timeout: config?.timeout ?? 120_000,
      headers: {
        Accept: 'text/csv, application/json, text/plain, */*',
        ...(config?.headers ?? {}),
      },
    });

    if (!isSuccessStatus(response.status)) {
      throw new Error('errors.network.requestFailed');
    }

    const body = typeof response.data === 'string' ? response.data : String(response.data ?? '');
    const contentType = (response.headers['content-type'] as string | undefined) ?? null;
    const contentDisposition = (response.headers['content-disposition'] as string | undefined) ?? null;

    return { body, contentType, contentDisposition };
  } catch (error) {
    await handleApiError(error);
    throw error;
  }
}

const DOCUMENT_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

/** Multipart upload with auth headers (long timeout for large files). */
export async function postFormData<TResponse = unknown>(
  path: string,
  formData: FormData,
  timeout = DOCUMENT_UPLOAD_TIMEOUT_MS,
): Promise<TResponse> {
  try {
    const token = getAccessToken();
    const response = await axios.post<TResponse>(buildApiUrl(path), formData, {
      timeout,
      withCredentials: Platform.OS === 'web',
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      transformRequest: [(data) => data],
    });
    if (isSuccessStatus(response.status)) {
      return response.data;
    }
    throw new Error('errors.network.uploadFailed');
  } catch (error) {
    await handleApiError(error);
    throw error;
  }
}

export { buildApiUrl, API_CONFIG };
