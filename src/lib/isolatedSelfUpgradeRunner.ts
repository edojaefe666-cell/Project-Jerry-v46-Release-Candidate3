import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type IsolatedTestStatus = 'unavailable' | 'passed' | 'failed';

export interface IsolatedTestResult {
  status: IsolatedTestStatus;
  report: string;
  requestId?: string;
  durationMs?: number;
}

export interface IsolatedTestRunnerOptions {
  endpoint?: string;
  secret?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  requestId?: string;
}

interface RunnerResponse {
  protocolVersion: 1;
  requestId: string;
  sourceSha256: string;
  testSha256: string;
  sandboxed: true;
  networkDisabled: true;
  status: 'passed' | 'failed';
  exitCode: number;
  durationMs: number;
  summary: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function signature(secret: string, raw: string): string {
  return createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
}

function validSignature(secret: string, raw: string, supplied: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = Buffer.from(signature(secret, raw), 'hex');
  const actual = Buffer.from(supplied, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function safeEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
    throw new Error('Test runner endpoint must be a credential-free HTTPS URL without query or fragment.');
  }
  return url;
}

export async function runIsolatedSelfUpgradeTests(
  input: { language: string; source: string; testCode: string },
  options: IsolatedTestRunnerOptions = {},
): Promise<IsolatedTestResult> {
  const endpointValue = options.endpoint ?? process.env.JERRY_TEST_RUNNER_URL;
  const secret = options.secret ?? process.env.JERRY_TEST_RUNNER_HMAC_SECRET;
  if (!endpointValue || !secret || secret.length < 32) {
    return {
      status: 'unavailable',
      report: 'Isolated test runner is not configured. No test code was executed; owner approval remains blocked.',
    };
  }

  let endpoint: URL;
  try {
    endpoint = safeEndpoint(endpointValue);
  } catch (error) {
    return {
      status: 'unavailable',
      report: error instanceof Error ? error.message : 'Invalid isolated test runner configuration.',
    };
  }

  const requestId = options.requestId ?? randomUUID();
  const sourceSha256 = sha256(input.source);
  const testSha256 = sha256(input.testCode);
  const payload = {
    protocolVersion: 1 as const,
    requestId,
    language: input.language,
    source: input.source,
    testCode: input.testCode,
    sourceSha256,
    testSha256,
    limits: {
      timeoutMs: Math.min(Math.max(options.timeoutMs ?? 10_000, 1_000), 15_000),
      memoryMb: 128,
      network: false,
      filesystem: 'ephemeral-only',
      subprocesses: false,
      credentials: false,
    },
  };
  const rawRequest = JSON.stringify(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(options.timeoutMs ?? 10_000, 1_000), 15_000));
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-jerry-runner-request-signature': signature(secret, rawRequest),
      },
      body: rawRequest,
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      return { status: 'unavailable', requestId, report: `Isolated test runner returned HTTP ${response.status}. No verified test result was accepted.` };
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > 16_384) {
      return { status: 'unavailable', requestId, report: 'Isolated test runner response exceeded the 16 KB limit.' };
    }
    const rawResponse = await response.text();
    if (rawResponse.length > 16_384) {
      return { status: 'unavailable', requestId, report: 'Isolated test runner response exceeded the 16 KB limit.' };
    }
    const responseSignature = response.headers.get('x-jerry-runner-response-signature') ?? '';
    if (!validSignature(secret, rawResponse, responseSignature)) {
      return { status: 'unavailable', requestId, report: 'Isolated test runner response signature is invalid.' };
    }

    let result: RunnerResponse;
    try {
      result = JSON.parse(rawResponse) as RunnerResponse;
    } catch {
      return { status: 'unavailable', requestId, report: 'Isolated test runner returned malformed JSON.' };
    }

    const valid =
      result.protocolVersion === 1 &&
      result.requestId === requestId &&
      result.sourceSha256 === sourceSha256 &&
      result.testSha256 === testSha256 &&
      result.sandboxed === true &&
      result.networkDisabled === true &&
      (result.status === 'passed' || result.status === 'failed') &&
      Number.isInteger(result.exitCode) &&
      Number.isFinite(result.durationMs) &&
      result.durationMs >= 0 &&
      result.durationMs <= 15_000 &&
      typeof result.summary === 'string' &&
      result.summary.length <= 1_000;
    if (!valid) {
      return { status: 'unavailable', requestId, report: 'Isolated test runner attestation did not match the request or required sandbox controls.' };
    }

    if (result.status === 'passed' && result.exitCode === 0) {
      return {
        status: 'passed',
        requestId,
        durationMs: result.durationMs,
        report: `Isolated runtime tests passed. Signed runner attestation verified; source and test hashes matched. ${result.summary}`,
      };
    }
    return {
      status: 'failed',
      requestId,
      durationMs: result.durationMs,
      report: `Isolated runtime tests failed (exit code ${result.exitCode}). ${result.summary}`,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      requestId,
      report: error instanceof Error && error.name === 'AbortError'
        ? 'Isolated test runner timed out. No verified test result was accepted.'
        : 'Isolated test runner could not be reached. No verified test result was accepted.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
