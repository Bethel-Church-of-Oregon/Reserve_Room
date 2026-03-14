import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export function createAdminSession(): string {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error('ADMIN_PASSWORD required');
  const token = randomBytes(32).toString('hex');
  const signature = createHmac('sha256', secret).update(token).digest('hex');
  return `${token}.${signature}`;
}

export function verifyAdminSession(cookieValue: string | undefined): boolean {
  if (!cookieValue || !cookieValue.includes('.')) return false;
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;

  const [token, signature] = cookieValue.split('.');
  if (!token || !signature || signature.length !== 64) return false;

  const expected = createHmac('sha256', secret).update(token).digest('hex');
  if (signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
