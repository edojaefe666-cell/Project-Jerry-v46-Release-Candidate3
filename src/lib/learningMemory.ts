import type { MemoryEntry } from './types.ts';

export type LearningEnhancement = {
  title?: unknown;
  content?: unknown;
  tags?: unknown;
};

export interface LearningPreparation {
  entry: MemoryEntry;
  enhanced: boolean;
}

/** Construct a safe, persistable record from the owner's exact submitted text. */
export function createOwnerLearningEntry(
  id: string,
  category: MemoryEntry['category'],
  information: string,
  createdAt: string,
): MemoryEntry {
  const content = information.trim();
  return {
    id,
    category,
    title: content.length > 64 ? `${content.slice(0, 61)}...` : content,
    content,
    outcome: 'insight',
    tags: ['owner-taught', category],
    createdAt,
  };
}

/**
 * Accept only bounded, non-empty model fields. Any malformed response leaves
 * the exact owner-authored entry intact; model output never replaces identity,
 * category, outcome, or creation time.
 */
export function applyLearningEnhancement(
  original: MemoryEntry,
  candidate: LearningEnhancement,
): LearningPreparation {
  if (typeof candidate.title !== 'string' || !candidate.title.trim() ||
      typeof candidate.content !== 'string' || !candidate.content.trim()) {
    return { entry: original, enhanced: false };
  }

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags
        .filter((tag): tag is string => typeof tag === 'string' && !!tag.trim())
        .map(tag => tag.trim().slice(0, 80))
        .slice(0, 6)
    : original.tags;

  return {
    entry: {
      ...original,
      title: candidate.title.trim().slice(0, 240),
      content: candidate.content.trim().slice(0, 20_000),
      tags,
    },
    enhanced: true,
  };
}
