import test from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeLocalEmergencyControl } from './emergencyStopSync.ts';

function fixture(stopped: boolean) {
  let writes = 0;
  let state = {
    stopped,
    reason: stopped ? 'secure first boot default' : 'owner previously resumed',
    updatedAt: new Date().toISOString(),
    ownerUid: stopped ? 'system' : 'owner-a',
  };
  return {
    store: {
      getEmergencyStop: () => state,
      setEmergencyStop: (next: boolean, ownerUid: string, reason: string) => {
        writes += 1;
        state = { stopped: next, ownerUid, reason, updatedAt: new Date().toISOString() };
        return state;
      },
    },
    state: () => state,
    writes: () => writes,
  };
}

test('shared owner recovery clears a stale first-boot SQLite stop on another instance', () => {
  const local = fixture(true);
  const result = synchronizeLocalEmergencyControl({
    stopped: false,
    reason: 'owner completed recovery review',
    updatedBy: 'owner-a',
  }, local.store);
  assert.equal(result.stopped, false);
  assert.equal(result.ownerUid, 'owner-a');
  assert.equal(local.writes(), 1);
});

test('shared owner stop is mirrored locally before the instance is considered synchronized', () => {
  const local = fixture(false);
  const result = synchronizeLocalEmergencyControl({
    stopped: true,
    reason: 'owner emergency stop engaged',
    updatedBy: 'owner-a',
  }, local.store);
  assert.equal(result.stopped, true);
  assert.equal(result.reason, 'owner emergency stop engaged');
  assert.equal(local.writes(), 1);
});

test('matching local and shared stop states do not create redundant SQLite audit writes', () => {
  const local = fixture(false);
  const result = synchronizeLocalEmergencyControl({
    stopped: false,
    reason: 'owner completed recovery review',
    updatedBy: 'owner-a',
  }, local.store);
  assert.equal(result.stopped, false);
  assert.equal(local.writes(), 0);
});

test('local mirror persistence failure propagates so the caller can fail closed', () => {
  const store = {
    getEmergencyStop: () => ({
      stopped: true,
      reason: 'stale local stop',
      updatedAt: new Date().toISOString(),
      ownerUid: 'owner-a',
    }),
    setEmergencyStop: () => { throw new Error('local audit persistence failed'); },
  };
  assert.throws(() => synchronizeLocalEmergencyControl({
    stopped: false,
    reason: 'owner completed recovery review',
    updatedBy: 'owner-a',
  }, store), /local audit persistence failed/);
});
