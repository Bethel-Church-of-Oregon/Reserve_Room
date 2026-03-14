import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function createRatelimit(tokens: number, window: Duration, prefix: string): InstanceType<typeof Ratelimit> | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `@ratelimit:${prefix}`,
  });
}

// Admin login: 5 attempts per minute (brute-force protection)
const adminLoginLimiter = createRatelimit(5, '1 m', 'admin-login');

// Reservation creation: 10 per minute per IP
const reservationLimiter = createRatelimit(10, '1 m', 'reservation');

// Cancel request: 10 per minute per IP
const cancelLimiter = createRatelimit(10, '1 m', 'cancel');

export async function checkAdminLoginLimit(req: NextRequest): Promise<{ limited: boolean }> {
  if (!adminLoginLimiter) return { limited: false };
  const ip = getClientIp(req);
  const { success } = await adminLoginLimiter.limit(ip);
  return { limited: !success };
}

export async function checkReservationLimit(req: NextRequest): Promise<{ limited: boolean }> {
  if (!reservationLimiter) return { limited: false };
  const ip = getClientIp(req);
  const { success } = await reservationLimiter.limit(ip);
  return { limited: !success };
}

export async function checkCancelLimit(req: NextRequest): Promise<{ limited: boolean }> {
  if (!cancelLimiter) return { limited: false };
  const ip = getClientIp(req);
  const { success } = await cancelLimiter.limit(ip);
  return { limited: !success };
}
