import { createHash, createHmac } from 'node:crypto';

export type NeonStorageSigningEnvironment = {
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_ENDPOINT_URL_S3?: string;
  AWS_REGION?: string;
};

export type PresignedStorageRequest = {
  method: 'GET' | 'PUT';
  bucket: string;
  objectKey: string;
  expiresInSeconds?: number;
  contentType?: string;
  now?: Date;
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const hmac = (key: Buffer | string, value: string): Buffer =>
  createHmac('sha256', key).update(value, 'utf8').digest();

const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    \`%\${character.charCodeAt(0).toString(16).toUpperCase()}\`,
  );

const encodePath = (value: string): string =>
  value.split('/').map(encodeRfc3986).join('/');

function validateObjectKey(key: string): void {
  if (!key || key.length > 1024 || key.startsWith('/') || key.includes('\\')) {
    throw new Error('Storage object key is invalid.');
  }
  const segments = key.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Storage object key is invalid.');
  }
}

export function createNeonStoragePresignedUrl(
  request: PresignedStorageRequest,
  environment: NeonStorageSigningEnvironment = process.env,
): { url: string; method: 'GET' | 'PUT'; headers: Record<string, string>; expiresAt: string } {
  const accessKeyId = environment.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = environment.AWS_SECRET_ACCESS_KEY?.trim();
  const endpointValue = environment.AWS_ENDPOINT_URL_S3?.trim();
  const region = environment.AWS_REGION?.trim();

  if (!accessKeyId || !secretAccessKey || !endpointValue || !region) {
    throw new Error('Neon private storage is not configured.');
  }
  if (!/^[a-z0-9-]{1,63}$/.test(request.bucket)) {
    throw new Error('Storage bucket name is invalid.');
  }
  validateObjectKey(request.objectKey);

  const expiresInSeconds = request.expiresInSeconds ?? 300;
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
    throw new Error('Storage URL expiry must be between 1 and 900 seconds.');
  }
  if (request.method === 'PUT' && (!request.contentType || request.contentType.length > 128)) {
    throw new Error('A valid content type is required for storage uploads.');
  }
  if (request.contentType && /[\r\n]/.test(request.contentType)) {
    throw new Error('Storage content type is invalid.');
  }

  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new Error('Neon storage endpoint is invalid.');
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Neon storage endpoint must be a clean HTTPS URL.');
  }

  const now = request.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Storage signing time is invalid.');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 's3';
  const scope = \`\${dateStamp}/\${region}/\${service}/aws4_request\`;
  const host = endpoint.host;
  const basePath = endpoint.pathname.replace(/\/$/, '');
  const canonicalUri = \`\${basePath}/\${encodeRfc3986(request.bucket)}/\${encodePath(request.objectKey)}\`;

  const query: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', \`\${accessKeyId}/\${scope}\`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresInSeconds)],
    ['X-Amz-SignedHeaders', request.contentType ? 'content-type;host' : 'host'],
  ];
  const canonicalQuery = query
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey < rightKey ? -1 : leftKey > rightKey ? 1 :
        leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0,
    )
    .map(([key, value]) => \`\${key}=\${value}\`)
    .join('&');

  const canonicalHeaders = request.contentType
    ? \`content-type:\${request.contentType.trim()}\nhost:\${host}\n\`
    : \`host:\${host}\n\`;
  const signedHeaders = request.contentType ? 'content-type;host' : 'host';
  const canonicalRequest = [
    request.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');

  const dateKey = hmac(\`AWS4\${secretAccessKey}\`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const url = new URL(endpoint.toString());
  url.pathname = canonicalUri;
  url.search = \`\${canonicalQuery}&X-Amz-Signature=\${signature}\`;

  return {
    url: url.toString(),
    method: request.method,
    headers: request.contentType ? { 'content-type': request.contentType.trim() } : {},
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
  };
}
