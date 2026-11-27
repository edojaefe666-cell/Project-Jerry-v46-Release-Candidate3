import fs from 'node:fs';
import path from 'node:path';

const PLACEHOLDER = /(?:\\.invalid$|localhost$|example\\.(?:com|net|org)$|changeme|placeholder|your[-_])/i;

export function validateConnectedRelease({ env, firebaseConfig, nativeResources, keystoreExists }) {
  const errors = [];
  const origin = env.JERRY_BACKEND_ORIGIN;
  try {
    if (!origin) throw new Error('missing');
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash ||
        PLACEHOLDER.test(url.hostname) ||
        ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname) ||
        !url.hostname.includes('.')) throw new Error('invalid');
  } catch {
    errors.push('JERRY_BACKEND_ORIGIN must be a real, clean HTTPS origin (no path, credentials, query, fragment, localhost or placeholder host).');
  }

  const expectedProject = env.JERRY_FIREBASE_PROJECT_ID;
  if (!expectedProject || PLACEHOLDER.test(expectedProject) ||
      firebaseConfig?.projectId !== expectedProject ||
      firebaseConfig?.authDomain !== `${expectedProject}.firebaseapp.com` ||
      !/^1:\\d+:web:[a-f0-9]+$/i.test(firebaseConfig?.appId ?? '') ||
      !/^AIza[\\w-]{30,}$/.test(firebaseConfig?.apiKey ?? '')) {
    errors.push('Firebase project ID must explicitly match the checked-in web client configuration, including its project domain and valid web app/API-key fields.');
  }

  const expectedClient = env.JERRY_GOOGLE_WEB_CLIENT_ID;
  if (!expectedClient || PLACEHOLDER.test(expectedClient) ||
      !/^[0-9]+-[a-z0-9-]+\\.apps\\.googleusercontent\\.com$/.test(expectedClient) ||
      firebaseConfig?.oAuthClientId !== expectedClient ||
      !nativeResources.includes(expectedClient)) {
    errors.push('JERRY_GOOGLE_WEB_CLIENT_ID must match both the Firebase client configuration and Android default_web_client_id resource.');
  }

  for (const key of ['JERRY_ANDROID_KEYSTORE_FILE', 'JERRY_ANDROID_KEY_ALIAS',
    'JERRY_ANDROID_STORE_PASSWORD', 'JERRY_ANDROID_KEY_PASSWORD']) {
    if (!env[key] || PLACEHOLDER.test(env[key])) errors.push(`${key} is required for a connected signed release.`);
  }
  if (!keystoreExists) errors.push('The configured Android signing keystore file must exist and be readable.');
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const resourcePath = path.resolve(process.cwd(), 'android-native/app/src/main/res/values/strings.xml');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const resources = fs.readFileSync(resourcePath, 'utf8');
  const keystore = process.env.JERRY_ANDROID_KEYSTORE_FILE;
  const errors = validateConnectedRelease({
    env: process.env,
    firebaseConfig: config,
    nativeResources: resources,
    keystoreExists: Boolean(keystore && fs.existsSync(keystore) && fs.statSync(keystore).isFile()),
  });
  if (errors.length) {
    console.error('Connected Android release configuration rejected:');
    for (const error of errors) console.error(` - ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Connected Android release configuration validated.');
  }
}
