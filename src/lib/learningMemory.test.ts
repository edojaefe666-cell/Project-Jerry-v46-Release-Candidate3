import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLearningEnhancement, createOwnerLearningEntry, memoryAreaForCategory } from './learningMemory.ts';

const original = createOwnerLearningEntry(
  'memory-test-1',
  'lesson',
  "Preserve the owner's exact knowledge when AI enhancement is unavailable.",
  '2026-11-26T12:00:00.000Z',
);

test('creates an owner-authored fallback entry without changing its meaning', () => {
  assert.equal(original.content, "Preserve the owner's exact knowledge when AI enhancement is unavailable.");
  assert.equal(original.category, 'lesson');
  assert.deepEqual(original.tags, ['owner-taught', 'lesson']);
});

test('keeps the original entry when the model response is malformed', () => {
  const result = applyLearningEnhancement(original, { title: ' ', content: 42, tags: ['x'] });
  assert.equal(result.enhanced, false);
  assert.deepEqual(result.entry, original);
});

test('bounds enhanced fields and filters unsafe tag values', () => {
  const result = applyLearningEnhancement(original, {
    title: '  Organized lesson  ',
    content: '  Faithful organized content  ',
    tags: ['  durable  ', '', 7, 'x'.repeat(100)],
  });
  assert.equal(result.enhanced, true);
  assert.equal(result.entry.title, 'Organized lesson');
  assert.equal(result.entry.content, 'Faithful organized content');
  assert.deepEqual(result.entry.tags, ['durable', 'x'.repeat(80)]);
  assert.equal(result.entry.id, original.id);
  assert.equal(result.entry.category, original.category);
  assert.equal(result.entry.createdAt, original.createdAt);
});

test('caps model-provided title, content and tag count at persistence limits', () => {
  const result = applyLearningEnhancement(original, {
    title: 't'.repeat(300),
    content: 'c'.repeat(21_000),
    tags: Array.from({ length: 10 }, (_, index) => `tag-${index}`),
  });
  assert.equal(result.entry.title.length, 240);
  assert.equal(result.entry.content.length, 20_000);
  assert.equal(result.entry.tags.length, 6);
});

test('maps all legacy categories into Jerry three persistent memory areas', () => {
  assert.equal(memoryAreaForCategory('preference'), 'owner_profile');
  assert.equal(memoryAreaForCategory('goal'), 'mission_projects');
  assert.equal(memoryAreaForCategory('workflow'), 'mission_projects');
  assert.equal(memoryAreaForCategory('decision'), 'knowledge_experience');
  assert.equal(memoryAreaForCategory('lesson'), 'knowledge_experience');
});
