export interface RateLimitRequest {
  user?: { uid?: string };
}

export interface RateLimitResponse {
  status(code: number): this;
  setHeader(name: string, value: string): this;
  json(body: unknown): unknown;
}

export interface OwnerRateLimitOptions {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}

/**
 * Bounded, per-owner fixed-window limiter for expensive authenticated actions.
 * This is process-local protection; production deployments with multiple
 * instances must also enforce a shared gateway/provider quota.
 */
export function createOwnerRateLimiter(options: OwnerRateLimitOptions) {
  const limit = Math.floor(options.limit);
  const windowMs = Math.floor(options.windowMs);
  const maxKeys = Math.max(1, Math.floor(options.maxKeys ?? 1_000));
  if (!Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error('Rate-limit count and window must be positive safe integers.');
  }

  const now = options.now ?? Date.now;
  const buckets = new Map<string, { startedAt: number; count: number; touchedAt: number }>();

  return (req: RateLimitRequest, res: RateLimitResponse, next: () => void): void => {
    const uid = req.user?.uid?.trim();
    if (!uid) {
      res.status(401).json({ error: 'Authenticated owner identity is required.' });
      return;
    }

    const currentTime = now();
    let bucket = buckets.get(uid);
    if (!bucket || currentTime - bucket.startedAt >= windowMs || currentTime < bucket.startedAt) {
      bucket = { startedAt: currentTime, count: 0, touchedAt: currentTime };
      buckets.set(uid, bucket);
    }
    bucket.touchedAt = currentTime;

    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.startedAt + windowMs - currentTime) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.startedAt + windowMs) / 1000)));
      res.status(429).json({ error: 'Jerry request limit reached. Please retry after the indicated interval.' });
      return;
    }

    bucket.count += 1;
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.startedAt + windowMs) / 1000)));

    if (buckets.size > maxKeys) {
      for (const [key, value] of buckets) {
        if (currentTime - value.startedAt >= windowMs || currentTime < value.startedAt) buckets.delete(key);
      }
      while (buckets.size > maxKeys) {
        const oldestKey = buckets.keys().next().value as string | undefined;
        if (!oldestKey) break;
        buckets.delete(oldestKey);
      }
    }
    next();
  };
}
