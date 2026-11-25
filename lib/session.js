import prisma from './prisma.js';
import { readSession, decryptToken } from './auth.js';

/**
 * Server-side session checks. A signed cookie alone is not enough:
 *  - its version must match the user's sessionVersion (logout or a revoked GitHub grant bumps it);
 *  - on the live site the account must still have GitHub access. Anything that changes data asks
 *    GitHub every time; page loads reuse an answer for up to READ_RECHECK_MS.
 * If someone revokes Digital Graveyard on GitHub, their next action is refused and every open
 * tab is signed out.
 */

const READ_RECHECK_MS = 5 * 60 * 1000;

const clean = v => (v || '').replace(/^["']|["']$/g, '').trim();

export class SessionError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Live site with GitHub sign-in configured, or forced on for tests.
function githubChecksOn() {
  if (process.env.GITHUB_SESSION_CHECKS === 'off') return false;
  if (process.env.GITHUB_SESSION_CHECKS === 'on') return true;
  return process.env.NODE_ENV === 'production' &&
    Boolean(clean(process.env.GITHUB_CLIENT_ID) && clean(process.env.GITHUB_CLIENT_SECRET));
}

function appAuthHeader() {
  const id = clean(process.env.GITHUB_CLIENT_ID);
  const secret = clean(process.env.GITHUB_CLIENT_SECRET);
  return { id, header: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` };
}

// Asks GitHub whether this OAuth token is still valid for our app.
// Returns 'valid', 'revoked', or 'unknown' (GitHub unreachable or misconfigured).
async function askGithub(token) {
  const { id, header } = appAuthHeader();
  try {
    const res = await fetch(`https://api.github.com/applications/${id}/token`, {
      method: 'POST',
      headers: {
        Authorization: header,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Digital-Graveyard'
      },
      body: JSON.stringify({ access_token: token }),
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 200) return 'valid';
    if (res.status === 404 || res.status === 422) return 'revoked';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

let checkToken = askGithub;
// Tests replace the GitHub call.
export function setGithubTokenChecker(fn) {
  checkToken = fn || askGithub;
}

// Ends every session for this user and forgets their GitHub token.
export async function signOutEverywhere(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 }, githubTokenEnc: null, githubCheckedAt: null }
  });
}

// Best effort: tells GitHub to drop this token (the user's grant stays; they can sign in again).
export async function revokeGithubToken(sealed) {
  const token = sealed ? decryptToken(sealed) : null;
  if (!token || !githubChecksOn()) return;
  const { id, header } = appAuthHeader();
  await fetch(`https://api.github.com/applications/${id}/token`, {
    method: 'DELETE',
    headers: { Authorization: header, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Digital-Graveyard' },
    body: JSON.stringify({ access_token: token }),
    signal: AbortSignal.timeout(8000)
  }).catch(() => {});
}

/**
 * Returns the signed-in user, or throws SessionError.
 * `write: true` for anything that changes data: GitHub is asked every time, and if GitHub can't
 * be reached the action is refused rather than trusting a possibly revoked sign-in.
 */
export async function getSessionUser(req, { write = false } = {}) {
  const session = readSession(req);
  if (!session) throw new SessionError(401, 'Please sign in.', 'SIGNED_OUT');

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new SessionError(401, 'Please sign in again.', 'SIGNED_OUT');

  // Unsigned dev/test sessions (x-user-id) have no version; signed ones must match.
  if (!session.unsigned && (session.v ?? -1) !== user.sessionVersion) {
    throw new SessionError(401, 'You were signed out. Please sign in again.', 'SIGNED_OUT');
  }

  if (!githubChecksOn()) return user;

  // Live site: only GitHub accounts with a token we can check.
  if (!user.githubId || !user.githubTokenEnc) {
    throw new SessionError(401, 'Please sign in with GitHub again.', 'SIGNED_OUT');
  }
  const checkedAgo = user.githubCheckedAt ? Date.now() - new Date(user.githubCheckedAt).getTime() : Infinity;
  if (!write && checkedAgo < READ_RECHECK_MS) return user;

  const token = decryptToken(user.githubTokenEnc);
  const verdict = token ? await checkToken(token) : 'revoked';
  if (verdict === 'revoked') {
    await signOutEverywhere(user.id);
    throw new SessionError(401, 'Your GitHub access to Digital Graveyard was revoked, so you have been signed out.', 'GITHUB_REVOKED');
  }
  if (verdict === 'unknown') {
    if (write) throw new SessionError(503, 'Could not confirm your GitHub sign-in right now. Please try again in a minute.', 'GITHUB_UNREACHABLE');
    return user;
  }
  await prisma.user.update({ where: { id: user.id }, data: { githubCheckedAt: new Date() } });
  return user;
}

// For API routes: returns the user, or sends the error response and returns null.
export async function requireUser(req, res, opts) {
  try {
    return await getSessionUser(req, opts);
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
    res.status(err.status).json({ error: err.message, code: err.code });
    return null;
  }
}

// For pages anyone can view: the signed-in user, or null.
export async function optionalUser(req) {
  try {
    return await getSessionUser(req);
  } catch (err) {
    if (err instanceof SessionError) return null;
    throw err;
  }
}
