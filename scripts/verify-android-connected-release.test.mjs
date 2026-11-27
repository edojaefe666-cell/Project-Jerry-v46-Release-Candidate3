import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConnectedRelease } from './verify-android-connected-release.mjs';

const base = {
  env: {
    JERRY_BACKEND_ORIGIN: 'https://api.jerry.example.ng',
    JERRY_FIREBASE_PROJECT_ID: 'jerry-prod-123',
    JERRY_GOOGLE_WEB_CLIENT_ID: '123456789-abc123.apps.googleusercontent.com',
    JERRY_ANDROID_KEYSTORE_FILE: '/tmp/jerry-release.jks',
    JERRY_ANDROID_KEY_ALIAS: 'jerry-release',
    JERRY_ANDROID_STORE_PASSWORD: 'store-password',
    JERRY_ANDROID_KEY_PASSWORD: 'key-password',
  },
  firebaseConfig: {
    projectId: 'jerry-prod-123',
    authDomain: 'jerry-prod-123.firebaseapp.com',
    appId: '1:123456789:web:abcdef012345',
    apiKey: 'AIza' + 'a'.repeat(35),
    oAuthClientId: '123456789-abc123.apps.googleusercontent.com',
  },
  nativeResources: '<string name="default_web_client_id">123456789-abc123.apps.googleusercontent.com</string>',
  keystoreExists: true,
};

test('accepts a complete connected release configuration', () => {
  assert.deepEqual(validateConnectedRelease(base), []);
});

test('rejects missing and placeholder backend origins', () => {
  for (const origin of [undefined, 'https://jerry-backend.invalid', 'http://api.jerry.example.ng',
    'https://api.jerry.example.ng/path', 'https://user:pass@api.jerry.example.ng',
    'https://localhost', 'https://api.jerry.example.ng?debug=1']) {
    const errors = validateConnectedRelease({ ...base, env: { ...base.env, JERRY_BACKEND_ORIGIN: origin } });
    assert.ok(errors.some((error) => error.includes('JERRY_BACKEND_ORIGIN')), String(origin));
  }
});

test('rejects Firebase project mismatch or malformed client configuration', () => {
  const errors = validateConnectedRelease({
    ...base,
    firebaseConfig: { ...base.firebaseConfig, projectId: 'other-project' },
  });
  assert.ok(errors.some((error) => error.includes('Firebase project ID')));
});

test('rejects OAuth client mismatch', () => {
  const errors = validateConnectedRelease({
    ...base,
    nativeResources: '<resources></resources>',
  });
  assert.ok(errors.some((error) => error.includes('JERRY_GOOGLE_WEB_CLIENT_ID')));
});

test('rejects incomplete signing material and missing keystore', () => {
  const errors = validateConnectedRelease({
    ...base,
    env: { ...base.env, JERRY_ANDROID_KEY_PASSWORD: '' },
    keystoreExists: false,
  });
  assert.ok(errors.some((error) => error.includes('JERRY_ANDROID_KEY_PASSWORD')));
  assert.ok(errors.some((error) => error.includes('keystore file')));
});
