import { buildApiUrl, deleteApi, get, patch, post, put } from '@/network/request';

type LegacyRequestOptions = RequestInit & {
  path: string;
};

/**
 * @deprecated Use `get`, `post`, `put`, `patch`, or `deleteApi` from `@/network/request`.
 */
export async function apiRequest<T>(options: LegacyRequestOptions): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const config = {
    headers: options.headers as Record<string, string> | undefined,
    skipAuth: false,
  };

  switch (method) {
    case 'POST':
      return (await post(options.path, options.body ? JSON.parse(String(options.body)) : undefined, config)) as T;
    case 'PUT':
      return (await put(options.path, options.body ? JSON.parse(String(options.body)) : undefined, config)) as T;
    case 'PATCH':
      return (await patch(options.path, options.body ? JSON.parse(String(options.body)) : undefined, config)) as T;
    case 'DELETE':
      return (await deleteApi(options.path, config)) as T;
    case 'GET':
    default:
      return (await get<T>(options.path, config)) as T;
  }
}

export { buildApiUrl, deleteApi, get, patch, post, put };
