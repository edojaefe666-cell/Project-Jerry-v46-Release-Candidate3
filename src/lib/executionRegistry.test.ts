import assert from 'node:assert/strict';
import test from 'node:test';
import { ExecutionRegistry } from './executionRegistry.ts';

test('owner stop aborts all registered in-flight work', () => {
  const registry = new ExecutionRegistry(false);
  const first = registry.register();
  const second = registry.register();
  assert.equal(registry.activeCount, 2);
  registry.setStopped(true, 'Owner emergency stop');
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  assert.equal(registry.isStopped, true);
  first.release();
  second.release();
  assert.equal(registry.activeCount, 0);
});

test('work registered during emergency stop is aborted immediately', () => {
  const registry = new ExecutionRegistry(true);
  const execution = registry.register();
  assert.equal(execution.signal.aborted, true);
  execution.release();
  assert.equal(registry.activeCount, 0);
});

test('explicit recovery allows new work without reviving aborted work', () => {
  const registry = new ExecutionRegistry(false);
  const beforeStop = registry.register();
  registry.setStopped(true);
  registry.setStopped(false);
  const afterResume = registry.register();
  assert.equal(beforeStop.signal.aborted, true);
  assert.equal(afterResume.signal.aborted, false);
  assert.equal(registry.isStopped, false);
  beforeStop.release();
  afterResume.release();
  assert.equal(registry.activeCount, 0);
});

test('release is idempotent and does not leak registrations', () => {
  const registry = new ExecutionRegistry(false);
  const execution = registry.register();
  execution.release();
  execution.release();
  assert.equal(registry.activeCount, 0);
});
