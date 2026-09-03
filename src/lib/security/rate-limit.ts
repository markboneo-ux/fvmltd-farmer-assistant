/**
 * Server-side sliding-window rate limiter.
 * Keys combine anonymous session, authenticated user, and IP where useful.
 */

export type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitBucket>();

export type RateLimitRule = {
  name: string;
  windowMs: number;
  max: number;
};

export const RATE_LIMITS = {
  ai: { name: "ai", windowMs: 60_000, max: 20 },
  image: { name: "image", windowMs: 60_000, max: 8 },
  promo: { name: "promo", windowMs: 10 * 60_000, max: 8 },
  auth: { name: "auth", windowMs: 15 * 60_000, max: 12 },
  signup: { name: "signup", windowMs: 60 * 60_000, max: 6 },
} as const;

export const FARMER_RATE_LIMIT_MESSAGE =
  "You're sending requests a bit too quickly. Please wait a moment and try again.";

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitKey(parts: {
  rule: string;
  sessionId?: string | null;
  userId?: string | null;
  ip?: string | null;
}): string {
  return [
    parts.rule,
    parts.userId || parts.sessionId || "anon",
    parts.ip || "noip",
  ].join(":");
}

export function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): { ok: true; remaining: number } | { ok: false; retryAfterSec: number } {
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, remaining: rule.max - 1 };
  }
  if (existing.count >= rule.max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  store.set(key, existing);
  return { ok: true, remaining: rule.max - existing.count };
}

export function resetRateLimitStore() {
  store.clear();
}

export function checkCombinedRateLimit(options: {
  rule: RateLimitRule;
  sessionId?: string | null;
  userId?: string | null;
  ip?: string | null;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const keys = [
    rateLimitKey({
      rule: options.rule.name,
      sessionId: options.sessionId,
      userId: options.userId,
      ip: options.ip,
    }),
    options.ip
      ? rateLimitKey({
          rule: `${options.rule.name}-ip`,
          ip: options.ip,
        })
      : null,
  ].filter((key): key is string => Boolean(key));

  for (const key of keys) {
    const result = consumeRateLimit(key, options.rule);
    if (!result.ok) return result;
  }
  return { ok: true };
}
