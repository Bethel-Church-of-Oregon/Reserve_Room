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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function check(
  limiter: InstanceType<typeof Ratelimit> | null,
  key: string
): Promise<{ limited: boolean }> {
  if (!limiter) return { limited: false };
  const { success } = await limiter.limit(key);
  return { limited: !success };
}

// Admin login: 5 attempts per minute (brute-force protection).
// Deliberately still keyed by IP alone — there is no identity to key on before
// the password is checked, and a shared church IP getting five tries a minute is
// an acceptable cost for keeping password guessing hopeless.
const adminLoginLimiter = createRatelimit(5, '1 m', 'admin-login');

/**
 * Write paths are limited in two layers, because one is not enough here.
 *
 * Everyone on the church WiFi leaves through a single public IP, so a tight
 * per-IP cap throttled the whole congregation collectively: under the old
 * 10-per-minute limit, the eleventh person to submit after a Sunday
 * announcement was rejected without anyone having done anything wrong.
 *
 * So the IP layer became a coarse ceiling with real headroom, and the tight
 * limit moved onto the email address, which identifies a person instead of a
 * network. The email layer is not a security boundary by itself — an abuser can
 * simply vary the address — which is why the IP ceiling stays, and why the
 * shared reservation code remains the thing that keeps strangers out.
 */
const reservationIpLimiter = createRatelimit(60, '1 m', 'reservation-ip');
const reservationEmailLimiter = createRatelimit(5, '1 m', 'reservation-email');

const cancelIpLimiter = createRatelimit(60, '1 m', 'cancel-ip');
const cancelEmailLimiter = createRatelimit(5, '1 m', 'cancel-email');

// Editing gets a looser per-person allowance than booking: people genuinely do
// nudge a start time several times in a row while settling on a slot.
const editIpLimiter = createRatelimit(60, '1 m', 'edit-ip');
const editEmailLimiter = createRatelimit(10, '1 m', 'edit-email');

export async function checkAdminLoginLimit(req: NextRequest): Promise<{ limited: boolean }> {
  return check(adminLoginLimiter, getClientIp(req));
}

export async function checkReservationLimit(req: NextRequest): Promise<{ limited: boolean }> {
  return check(reservationIpLimiter, getClientIp(req));
}

export async function checkReservationEmailLimit(email: string): Promise<{ limited: boolean }> {
  return check(reservationEmailLimiter, normalizeEmail(email));
}

export async function checkCancelLimit(req: NextRequest): Promise<{ limited: boolean }> {
  return check(cancelIpLimiter, getClientIp(req));
}

export async function checkCancelEmailLimit(email: string): Promise<{ limited: boolean }> {
  return check(cancelEmailLimiter, normalizeEmail(email));
}

export async function checkEditLimit(req: NextRequest): Promise<{ limited: boolean }> {
  return check(editIpLimiter, getClientIp(req));
}

export async function checkEditEmailLimit(email: string): Promise<{ limited: boolean }> {
  return check(editEmailLimiter, normalizeEmail(email));
}
