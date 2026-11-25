import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const DEV_SECRET = 'digital_graveyard_local_dev_secret';

// Sessions are signed with SESSION_SECRET (or CRON_SECRET). The built-in value is public in this
// repo, so the live site refuses to sign or accept anything with it.
function sessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.CRON_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is not set: refusing to sign sessions with a public key.');
  }
  return DEV_SECRET;
}

// GitHub tokens are stored encrypted (AES-256-GCM) with a key derived from the session secret.
function tokenKey() {
  return crypto.createHash('sha256').update(`${sessionSecret()}:github-token`).digest();
}

export function encryptToken(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}

export function decryptToken(sealed) {
  try {
    const [iv, tag, data] = String(sealed).split('.').map(x => Buffer.from(x, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function generateAlias() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Digger-${num}`;
}

export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Creates a tamper-proof cryptographically signed session token.
 * Payload: { userId, alias, v, exp, iat }. `v` must match the user's sessionVersion, so bumping
 * that number (logout, GitHub access revoked) ends every session the user has.
 */
export function createSessionToken(userId, alias, version = 0) {
  const payload = {
    userId,
    alias: alias || 'Digger',
    v: version,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 days
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verifies the cryptographic HMAC signature and expiry of a session token.
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;

  try {
    const expectedSig = crypto.createHmac('sha256', sessionSecret()).update(data).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Formats standard Set-Cookie header for the session token
 */
export function serializeSessionCookie(token) {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = 30 * 24 * 60 * 60; // 30 days
  return `graveyard_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProd ? '; Secure' : ''}`;
}

/**
 * Formats Set-Cookie header to invalidate/clear the session on logout
 */
export function serializeClearCookie() {
  const isProd = process.env.NODE_ENV === 'production';
  return `graveyard_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isProd ? '; Secure' : ''}`;
}

/**
 * Helper to parse raw Cookie header string into key-value map
 */
export function parseCookieHeader(cookieHeader = '') {
  const map = {};
  if (!cookieHeader) return map;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    map[key] = decodeURIComponent(val);
  }
  return map;
}

/**
 * Strips sensitive identity fields.
 * Only the user themselves may see their own email.
 * Password hash is never exposed.
 */
export function sanitizeUser(user, isSelf = false) {
  if (!user) return null;
  const { passwordHash, email, githubId, githubUsername, ...rest } = user;
  if (isSelf) {
    return { ...rest, email, githubId, githubUsername };
  }
  // Others only learn the alias and whether GitHub is linked — never the real GitHub identity.
  return { ...rest, githubConnected: Boolean(githubId) };
}

/**
 * Universally authenticates an incoming request:
 * 1. Checks signed HttpOnly cookie 'graveyard_session'
 * 2. Checks 'Authorization: Bearer <token>' header
 * 3. Checks 'x-user-id' header or legacy 'graveyard_user_id' cookie (dev/testing fallback)
 */
export function parseSession(req) {
  return readSession(req)?.userId || null;
}

// Like parseSession, but returns { userId, v, unsigned } so callers can check the session version.
// Prefer getSessionUser()/requireUser() in lib/session.js, which do that check against the database.
export function readSession(req) {
  if (!req) return null;

  // 1. Check cookies for signed cryptographic session
  const rawCookie = req.headers?.cookie || '';
  const cookies = req.cookies || parseCookieHeader(rawCookie);
  const sessionToken = cookies['graveyard_session'];

  if (sessionToken) {
    const verified = verifySessionToken(sessionToken);
    if (verified?.userId) {
      return { userId: verified.userId, v: verified.v, unsigned: false };
    }
  }

  // 2. Check Authorization header: Bearer <token>
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = verifySessionToken(token);
    if (verified?.userId) {
      return { userId: verified.userId, v: verified.v, unsigned: false };
    }
  }

  // 3. Unsigned fallbacks (x-user-id header / plain cookie) let anyone claim to be anyone,
  //    so they only work in local development and scripted tests.
  if (process.env.NODE_ENV !== 'production') {
    const explicitUserId = req.headers?.['x-user-id'] || cookies['graveyard_user_id'];
    if (explicitUserId) {
      return { userId: explicitUserId, v: null, unsigned: true };
    }
  }

  return null;
}

// The six shared demo accounts anyone may switch into for presentations.
// Real accounts (email sign-up or GitHub) can never be switched into.
export function isDemoPersona(user) {
  if (!user || user.githubId) return false;
  const email = (user.email || '').toLowerCase();
  return email.endsWith('@campus.edu') || email === 'devbot@graveyard.fi';
}
