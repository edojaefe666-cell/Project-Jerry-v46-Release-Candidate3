import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { memoryEntries } from './schema.ts';
import { getOrCreateUser } from './users.ts';
import type { JerryMemoryArea, MemoryEntry } from '../lib/types.ts';
import { memoryAreaForCategory } from '../lib/learningMemory.ts';

const MEMORY_CATEGORIES = new Set(['goal', 'decision', 'lesson', 'preference', 'workflow']);
const MEMORY_OUTCOMES = new Set(['success', 'correction', 'insight']);

export function validateMemoryEntry(entry: MemoryEntry): string | null {
  if (!entry || typeof entry !== 'object') return 'A memory entry is required.';
  if (typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 160) return 'Memory id is invalid.';
  if (!MEMORY_CATEGORIES.has(entry.category)) return 'Memory category is invalid.';
  if (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 240) return 'Memory title must be 1–240 characters.';
  if (typeof entry.content !== 'string' || !entry.content.trim() || entry.content.length > 20000) return 'Memory content must be 1–20,000 characters.';
  if (!Array.isArray(entry.tags) || entry.tags.length > 30 || entry.tags.some((tag) => typeof tag !== 'string' || tag.length > 80)) return 'Memory tags are invalid.';
  if (entry.outcome && !MEMORY_OUTCOMES.has(entry.outcome)) return 'Memory outcome is invalid.';
  if (typeof entry.createdAt !== 'string' || Number.isNaN(Date.parse(entry.createdAt))) return 'Memory timestamp is invalid.';
  return null;
}

export async function saveMemoryEntryForUser(uid: string, email: string, entry: MemoryEntry): Promise<MemoryEntry> {
  const validationError = validateMemoryEntry(entry);
  if (validationError) throw new Error(validationError);
  const user = await getOrCreateUser(uid, email);
  const rows = await db.insert(memoryEntries).values({
    id: entry.id,
    userId: user.id,
    category: entry.category,
    memoryArea: entry.area ?? memoryAreaForCategory(entry.category),
    title: entry.title.trim(),
    content: entry.content.trim(),
    outcome: entry.outcome ?? null,
    tags: entry.tags,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: memoryEntries.id,
    set: {
      category: entry.category,
      memoryArea: entry.area ?? memoryAreaForCategory(entry.category),
      title: entry.title.trim(),
      content: entry.content.trim(),
      outcome: entry.outcome ?? null,
      tags: entry.tags,
      updatedAt: new Date(),
    },
    setWhere: eq(memoryEntries.userId, user.id),
  }).returning({
    id: memoryEntries.id,
    category: memoryEntries.category,
    memoryArea: memoryEntries.memoryArea,
    title: memoryEntries.title,
    content: memoryEntries.content,
    outcome: memoryEntries.outcome,
    tags: memoryEntries.tags,
    createdAt: memoryEntries.createdAt,
  });
  if (!rows[0]) throw new Error('Memory id is already owned by another workspace.');
  return {
    ...rows[0],
    category: rows[0].category as MemoryEntry['category'],
    area: rows[0].memoryArea as JerryMemoryArea,
    outcome: rows[0].outcome as MemoryEntry['outcome'],
    tags: rows[0].tags as string[],
    createdAt: rows[0].createdAt.toISOString(),
  };
}

export async function searchMemoryForUser(
  uid: string,
  email: string,
  options: { query?: string; category?: string; area?: JerryMemoryArea; limit?: number } = {},
): Promise<MemoryEntry[]> {
  const user = await getOrCreateUser(uid, email);
  const conditions = [eq(memoryEntries.userId, user.id)];
  const query = options.query?.trim().slice(0, 200);
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(or(
      sql`to_tsvector('simple', coalesce(${memoryEntries.title}, '') || ' ' || coalesce(${memoryEntries.content}, '')) @@ plainto_tsquery('simple', ${query})`,
      sql`${memoryEntries.tags}::text ILIKE ${pattern}`,
    )!);
  }
  if (options.area) {
    const categoriesByArea: Record<JerryMemoryArea, MemoryEntry['category'][]> = {
      owner_profile: ['preference'],
      mission_projects: ['goal', 'workflow'],
      knowledge_experience: ['decision', 'lesson'],
    };
    conditions.push(inArray(memoryEntries.category, categoriesByArea[options.area]));
  }
  if (options.category && options.category !== 'all') {
    if (!MEMORY_CATEGORIES.has(options.category)) throw new Error('Memory category is invalid.');
    conditions.push(eq(memoryEntries.category, options.category));
  }
  const limit = Number.isSafeInteger(options.limit) ? Math.max(1, Math.min(100, options.limit!)) : 50;
  const rows = await db.select({
    id: memoryEntries.id,
    category: memoryEntries.category,
    memoryArea: memoryEntries.memoryArea,
    title: memoryEntries.title,
    content: memoryEntries.content,
    outcome: memoryEntries.outcome,
    tags: memoryEntries.tags,
    createdAt: memoryEntries.createdAt,
  }).from(memoryEntries)
    .where(and(...conditions))
    .orderBy(desc(memoryEntries.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    category: row.category as MemoryEntry['category'],
    area: row.memoryArea as JerryMemoryArea,
    outcome: row.outcome as MemoryEntry['outcome'],
    tags: row.tags as string[],
    createdAt: row.createdAt.toISOString(),
  }));
}
