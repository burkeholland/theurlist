import { adminDb } from './firebase-admin';
import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

interface RateLimitConfig {
  endpoint: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  publishAnonymous: { endpoint: 'publish-anon', limit: 10, windowSeconds: 3600 },
  publishAuthenticated: { endpoint: 'publish-auth', limit: 100, windowSeconds: 3600 },
  ogScrape: { endpoint: 'og-scrape', limit: 60, windowSeconds: 3600 },
  slugCheck: { endpoint: 'slug-check', limit: 120, windowSeconds: 3600 },
} satisfies Record<string, RateLimitConfig>;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function getWindowKey(windowSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowSeconds);
  return String(window);
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return '0.0.0.0';
}

export async function checkRateLimit(
  ip: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const ipHash = hashIp(ip);
  const windowKey = getWindowKey(config.windowSeconds);
  const ref = adminDb.ref(`_rateLimits/${config.endpoint}/${ipHash}/${windowKey}`);

  const result = await ref.transaction((currentCount: number | null) => {
    const count = currentCount || 0;
    if (count >= config.limit) {
      return; // Abort — over limit
    }
    return count + 1;
  });

  if (!result.committed) {
    return { allowed: false, retryAfter: config.windowSeconds };
  }

  return { allowed: true };
}
