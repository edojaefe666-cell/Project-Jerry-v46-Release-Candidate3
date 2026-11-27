/**
 * Merge headers from a Request with explicit fetch overrides.
 * Request headers are the base; init.headers takes precedence.
 */
export function mergeRequestHeaders(input: RequestInfo | URL, overrides?: HeadersInit): Headers {
  const headers = input instanceof Request ? new Headers(input.headers) : new Headers();
  new Headers(overrides).forEach((value, name) => headers.set(name, value));
  return headers;
}

/**
 * Keep a Request's method, body, signal, and fetch options when rebasing its URL.
 * Passing only its URL to fetch would silently discard those request properties.
 */
export function resolveRequestForFetch(
  input: RequestInfo | URL,
  resolvedInput: RequestInfo | URL,
): RequestInfo | URL {
  if (!(input instanceof Request)) return resolvedInput;
  if (String(resolvedInput) === input.url) return input;
  return new Request(resolvedInput, input);
}
