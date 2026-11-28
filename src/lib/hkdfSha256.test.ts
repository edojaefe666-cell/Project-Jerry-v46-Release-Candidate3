import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const cryptoProvider = webcrypto as unknown as Crypto;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

test('WebCrypto HKDF-SHA256 matches RFC 5869 test case one used by native Android tests', async () => {
  const ikm = new Uint8Array(22).fill(0x0b);
  const salt = fromHex('000102030405060708090a0b0c');
  const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
  const key = await cryptoProvider.subtle.importKey('raw', toArrayBuffer(ikm), 'HKDF', false, ['deriveBits']);
  const output = new Uint8Array(await cryptoProvider.subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: toArrayBuffer(salt),
    info: toArrayBuffer(info),
  }, key, 42 * 8));
  assert.equal(
    hex(output),
    '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
  );
  ikm.fill(0);
  salt.fill(0);
  info.fill(0);
  output.fill(0);
});
