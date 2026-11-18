import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

test('state responses derive BTC wallet balance from the posted journal', () => {
  const start = server.indexOf("app.get('/api/state'");
  const end = server.indexOf("app.post('/api/cloudsql/daily-summary'", start);
  const block = server.slice(start, end);
  assert.match(block, /getAuthoritativeWalletBtcSatoshis\(uid\)/);
  assert.match(block, /asset\.symbol === 'BTC' && asset\.network === 'Bitcoin Mainnet'/);
});

test('on-chain address sync cannot overwrite authoritative BTC accounting balance', () => {
  const start = server.indexOf("app.post('/api/wallet/sync-onchain'");
  const end = server.indexOf("app.post('/api/wallet/verify-tx'", start);
  const block = server.slice(start, end);
  assert.match(block, /On-chain address balance is evidence only/);
  assert.match(block, /balance: asset\.balance/);
  assert.match(block, /getAuthoritativeWalletBtcSatoshis\(uid\)/);
});

test('outgoing transfer authorization reads journal satoshis instead of walletAssets.balance', () => {
  const start = server.indexOf("app.post('/api/wallet/commands/submit-transfer'");
  const end = server.indexOf("// Real Live Bitcoin Market Price", start);
  const block = server.slice(start, end);
  assert.match(block, /getAuthoritativeWalletBtcSatoshis\(uid\)/);
  assert.match(block, /BigInt\(btcToSatoshis\(amount\)\)/);
  assert.doesNotMatch(block, /walletBtcBalance = current\.walletAssets/);
});
