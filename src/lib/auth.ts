import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * How long a signed admin session stays valid, independently of the cookie.
 *
 * The cookie itself has no maxAge, so a browser drops it on close — but that is
 * the browser's promise, not ours. Without an expiry baked into the signature, a
 * captured cookie value stayed valid until someone changed ADMIN_PASSWORD.
 */
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Tolerance for clock differences between serverless instances. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * `<random>.<issuedAt>.<signature>` — the issue time is inside the signed
 * payload, so it cannot be edited to extend a session.
 */
export function createAdminSession(): string {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error('ADMIN_PASSWORD required');
  const payload = `${randomBytes(32).toString('hex')}.${Date.now().toString(36)}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifyAdminSession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;

  const parts = cookieValue.split('.');
  // Sessions issued before the expiry change had two parts; they simply fail
  // here and the administrator signs in again.
  if (parts.length !== 3) return false;

  const [token, issuedAt, signature] = parts;
  if (!token || !issuedAt || signature.length !== 64) return false;

  const expected = createHmac('sha256', secret).update(`${token}.${issuedAt}`).digest('hex');
  try {
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return false;
    }
  } catch {
    return false;
  }

  // Only trusted once the signature proves we issued it.
  const issued = parseInt(issuedAt, 36);
  if (!Number.isFinite(issued)) return false;
  const age = Date.now() - issued;
  return age > -CLOCK_SKEW_MS && age < SESSION_MAX_AGE_MS;
}

/**
 * Constant-time password check.
 *
 * `timingSafeEqual` needs equal-length buffers and the length itself leaks, so
 * both sides are hashed to a fixed 32 bytes first: the comparison then takes the
 * same time whatever was submitted. The login rate limit already makes guessing
 * impractical; this closes the side channel it does not cover.
 */
export function adminPasswordMatches(supplied: unknown, expected: string): boolean {
  if (typeof supplied !== 'string') return false;
  const a = createHash('sha256').update(supplied, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
