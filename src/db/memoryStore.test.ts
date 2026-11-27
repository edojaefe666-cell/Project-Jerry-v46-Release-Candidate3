import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMemoryEntry } from './memoryStore.ts';
import type { MemoryEntry } from '../lib/types.ts';

const validEntry: MemoryEntry = {
  id: 'memory-test-1',
  category: 'lesson',
  title: 'A durable lesson',
  content: 'Keep verified facts separate from assumptions.',
  outcome: 'insight',
  tags: ['verification', 'planning'],
  createdAt: '2026-11-26T10:00:00.000Z',
};

test('accepts a valid persistent memory entry', () => {
  assert.equal(validateMemoryEntry(validEntry), null);
});

test('rejects unsupported categories and outcomes', () => {
  assert.match(validateMemoryEntry({ ...validEntry, category: 'secret' as MemoryEntry['category'] }) ?? '', /category/i);
  assert.match(validateMemoryEntry({ ...validEntry, outcome: 'unknown' as MemoryEntry['outcome'] }) ?? '', /outcome/i);
});

test('rejects empty or oversized memory content', () => {
  assert.match(validateMemoryEntry({ ...validEntry, content: '  ' }) ?? '', /content/i);
  assert.match(validateMemoryEntry({ ...validEntry, content: 'x'.repeat(20001) }) ?? '', /content/i);
});

test('rejects malformed tags, identifiers and timestamps', () => {
  assert.match(validateMemoryEntry({ ...validEntry, id: '' }) ?? '', /id/i);
  assert.match(validateMemoryEntry({ ...validEntry, tags: ['x'.repeat(81)] }) ?? '', /tags/i);
  assert.match(validateMemoryEntry({ ...validEntry, createdAt: 'not-a-date' }) ?? '', /timestamp/i);
});

test('rejects a memory area that conflicts with its legacy category', () => {
  const error = validateMemoryEntry({ ...validEntry, area: 'owner_profile' });
  assert.ok(error);
  assert.match(error, /area.*category/i);
  assert.equal(
    validateMemoryEntry({ ...validEntry, area: 'knowledge_experience' }),
    null,
  );
});
