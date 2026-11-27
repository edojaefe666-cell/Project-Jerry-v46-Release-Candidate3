/**
 * Merge headers from a Request with explicit fetch overrides.
 * Request headers are the base; init.headers takes precedence.
 */
export function mergeRequestHeaders(input: RequestInfo | URL, overrides?: HeadersInit): Headers {
  const headers = input instanceof Request ? new Headers(input.headers) : new Headers();
  new Headers(overrides).forEach((value, name) => headers.set(name, value));
  return headers;
}
