import assert from 'node:assert/strict';
import testRunner from 'node:test';
import { createNeonStoragePresignedUrl } from './neonStorageSigning.ts';

const environment = {
  AWS_ACCESS_KEY_ID: 'neon_test_access',
  AWS_SECRET_ACCESS_KEY: 'neon_test_secret',
  AWS_ENDPOINT_URL_S3: 'https://br-test.storage.c-10.eu-central-1.aws.neon.tech',
  AWS_REGION: 'eu-central-1',
};

const fixedTime = new Date('2026-11-27T18:30:00.000Z');

testRunner('creates a short-lived private Neon PUT URL with a bound content type', () => {
  const result = createNeonStoragePresignedUrl({
    method: 'PUT',
    bucket: 'jerry-private-storage',
    objectKey: 'owner/owner-123/attachments/report 1.pdf',
    contentType: 'application/pdf',
    expiresInSeconds: 120,
    now: fixedTime,
  }, environment);

  const url = new URL(result.url);
  assert.equal(result.method, 'PUT');
  assert.equal(result.headers['content-type'], 'application/pdf');
  assert.equal(url.protocol, 'https:');
  assert.equal(url.pathname, '/jerry-private-storage/owner/owner-123/attachments/report%201.pdf');
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '120');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host');
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[a-f0-9]{64}$/);
  assert.equal(result.expiresAt, '2026-11-27T18:32:00.000Z');
});

testRunner('creates a short-lived private Neon GET URL', () => {
  const result = createNeonStoragePresignedUrl({
    method: 'GET',
    bucket: 'jerry-private-storage',
    objectKey: 'owner/owner-123/avatar.png',
    now: fixedTime,
  }, environment);

  const url = new URL(result.url);
  assert.equal(result.method, 'GET');
  assert.deepEqual(result.headers, {});
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[a-f0-9]{64}$/);
});

testRunner('rejects unsafe keys and excessive URL lifetimes', () => {
  assert.throws(() => createNeonStoragePresignedUrl({
    method: 'GET', bucket: 'jerry-private-storage', objectKey: '../private.txt', now: fixedTime,
  }, environment), /object key is invalid/);

  assert.throws(() => createNeonStoragePresignedUrl({
    method: 'GET', bucket: 'jerry-private-storage', objectKey: 'owner/a/file.txt',
    expiresInSeconds: 901, now: fixedTime,
  }, environment), /expiry must be between 1 and 900/);
});

testRunner('fails closed when storage credentials or HTTPS endpoint are missing', () => {
  assert.throws(() => createNeonStoragePresignedUrl({
    method: 'GET', bucket: 'jerry-private-storage', objectKey: 'owner/a/file.txt', now: fixedTime,
  }, {}), /not configured/);

  assert.throws(() => createNeonStoragePresignedUrl({
    method: 'GET', bucket: 'jerry-private-storage', objectKey: 'owner/a/file.txt', now: fixedTime,
  }, { ...environment, AWS_ENDPOINT_URL_S3: 'http://br-test.storage.c-10.eu-central-1.aws.neon.tech' }), /HTTPS/);

  assert.throws(() => createNeonStoragePresignedUrl({
    method: 'GET', bucket: 'jerry-private-storage', objectKey: 'owner/a/file.txt', now: fixedTime,
  }, { ...environment, AWS_ENDPOINT_URL_S3: 'https://storage.attacker.example' }), /branch region/);

  assert.throws(() => createNeonStoragePresignedUrl({
    method: 'GET', bucket: 'jerry-private-storage', objectKey: 'owner/a/file.txt', now: fixedTime,
  }, { ...environment, AWS_REGION: 'us-east-1' }), /branch region/);
});


testRunner('creates a signed private Neon DELETE request for upload compensation', () => {
  const result = createNeonStoragePresignedUrl({ method: 'DELETE', bucket: 'jerry-private-storage', objectKey: 'owners/abc/uploads/object-id', expiresInSeconds: 120, now: fixedTime }, environment);
  const url = new URL(result.url);
  assert.equal(result.method, 'DELETE');
  assert.deepEqual(result.headers, {});
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[a-f0-9]{64}$/);
});
