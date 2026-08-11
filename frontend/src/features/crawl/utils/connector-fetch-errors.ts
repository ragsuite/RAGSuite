export function isConnectorNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  const status = (error as Error & { status?: number })?.status;
  return status === 404 || /404|not found/i.test(message);
}

export function isConnectorFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (isConnectorNotFoundError(error)) return true;
  return (
    error.message === 'errors.network.noResponse' ||
    error.message === 'errors.network.requestFailed' ||
    /network error|ECONNREFUSED|ERR_NETWORK|timeout/i.test(error.message)
  );
}
