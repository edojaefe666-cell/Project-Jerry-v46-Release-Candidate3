import test from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeLocalEmergencyControl } from './emergencyStopSync.ts';

function fixture(stopped: boolean, sharedEpoch = 0) {
  let writes = 0;
  let state = {
    stopped,
    reason: stopped ? 'secure first boot default' : 'owner previously resumed',
    updatedAt: new Date().toISOString(),
    ownerUid: stopped ? 'system' : 'owner-a',
    sharedEpoch,
  };
  return {
    store: {
      getEmergencyStop: () => state,
      synchronizeEmergencyStop: (next: boolean, ownerUid: string, reason: string, epoch: number) => {
        if (epoch < state.sharedEpoch) return state;
        if (epoch === state.sharedEpoch) {
          if (next !== state.stopped) throw new Error('Conflicting emergency-stop state for the same shared epoch.');
          return state;
        }
        writes += 1;
        state = { stopped: next, ownerUid, reason, sharedEpoch: epoch, updatedAt: new Date().toISOString() };
        return state;
      },
    },
    state: () => state,
    writes: () => writes,
  };
}

test('shared owner recovery clears a stale first-boot SQLite stop', () => {
  const local = fixture(true);
  const result = synchronizeLocalEmergencyControl({
    stopped: false, epoch: 1, reason: 'owner completed recovery review', updatedBy: 'owner-a',
  }, local.store);
  assert.equal(result.stopped, false);
  assert.equal(result.sharedEpoch, 1);
  assert.equal(local.writes(), 1);
});

test('shared owner stop is mirrored with its epoch', () => {
  const local = fixture(false);
  const result = synchronizeLocalEmergencyControl({
    stopped: true, epoch: 2, reason: 'owner emergency stop engaged', updatedBy: 'owner-a',
  }, local.store);
  assert.equal(result.stopped, true);
  assert.equal(result.sharedEpoch, 2);
  assert.equal(local.writes(), 1);
});

test('delayed older recovery snapshot cannot overwrite a newer stop', () => {
  const local = fixture(true, 8);
  const result = synchronizeLocalEmergencyControl({
    stopped: false, epoch: 7, reason: 'delayed old recovery', updatedBy: 'owner-a',
  }, local.store);
  assert.equal(result.stopped, true);
  assert.equal(result.sharedEpoch, 8);
  assert.equal(local.writes(), 0);
});

test('same epoch with conflicting stop state fails closed', () => {
  const local = fixture(true, 9);
  assert.throws(() => synchronizeLocalEmergencyControl({
    stopped: false, epoch: 9, reason: 'conflicting state', updatedBy: 'owner-a',
  }, local.store), /Conflicting emergency-stop state/);
});

test('local mirror persistence failure propagates so the caller can fail closed', () => {
  const store = {
    getEmergencyStop: () => ({
      stopped: true, reason: 'stale local stop', updatedAt: new Date().toISOString(),
      ownerUid: 'owner-a', sharedEpoch: 0,
    }),
    synchronizeEmergencyStop: () => { throw new Error('local audit persistence failed'); },
  };
  assert.throws(() => synchronizeLocalEmergencyControl({
    stopped: false, epoch: 1, reason: 'owner completed recovery review', updatedBy: 'owner-a',
  }, store), /local audit persistence failed/);
});
