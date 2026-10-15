// Signerede tokens (HMAC-SHA256), sikker sammenligning og simpel rate limiting.
// Tokens sendes som "Authorization: Bearer …" — ikke cookies — så CSRF ikke er en angrebsvej,
// og det virker også bag Shopifys app proxy, som fjerner cookies.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function createTokenSigner(secret) {
  if (!secret || secret.length < 32) throw new Error('Token-secret skal være mindst 32 tegn');
  const mac = (data) => createHmac('sha256', secret).update(data).digest();

  return {
    sign(payload, ttlSeconds) {
      const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds, jti: randomUUID() }));
      return `${body}.${b64url(mac(body))}`;
    },
    verify(token) {
      if (typeof token !== 'string' || token.length > 2048) return null;
      const [body, sig] = token.split('.');
      if (!body || !sig) return null;
      const expected = mac(body);
      const given = Buffer.from(sig, 'base64url');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
        return payload;
      } catch {
        return null;
      }
    },
  };
}

/** Sammenligner to strenge i konstant tid (også når længden er forskellig). */
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/** Fast vindue pr. nøgle (fx IP eller spiller-id). hit() returnerer false når grænsen er nået. */
export class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  hit(key) {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 50_000) this.prune(now);
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
