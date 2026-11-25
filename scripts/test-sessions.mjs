// Tests server-checked sessions (lib/session.js) against the LOCAL database:
//   DATABASE_URL=postgresql://postgres:graveyard@localhost:5433/graveyard node scripts/test-sessions.mjs
// GitHub is replaced by a fake, so revoking access can be tested without real accounts.
process.env.GITHUB_SESSION_CHECKS = 'on';

const { default: prisma } = await import('../lib/prisma.js');
const { createSessionToken, encryptToken, decryptToken } = await import('../lib/auth.js');
const { getSessionUser, setGithubTokenChecker, signOutEverywhere, SessionError } = await import('../lib/session.js');
const { requesterProfile } = await import('../lib/requesterProfile.js');

if (/neon|vercel|amazonaws/i.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL looks like a hosted database. Use the local one.');
  process.exit(1);
}

const TAG = `sesstest${Date.now()}`;
let fails = 0;
let n = 0;
const check = (name, ok, extra = '') => {
  n++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}. ${name}${!ok && extra ? `  -> ${extra}` : ''}`);
  if (!ok) fails++;
};
const reqWith = token => ({ headers: { cookie: `graveyard_session=${token}` } });
async function outcome(fn) {
  try {
    const user = await fn();
    return { ok: true, user };
  } catch (err) {
    return { ok: false, status: err.status, code: err.code, isSession: err instanceof SessionError, message: err.message };
  }
}

// Fake GitHub: answers from this map and counts calls.
let answer = 'valid';
let calls = 0;
setGithubTokenChecker(async token => { calls++; return token === 'gho_fake' ? answer : 'revoked'; });

let seq = 0;
const makeUser = (data = {}) => prisma.user.create({
  data: {
    email: `${TAG}-${++seq}@test.local`, alias: `${TAG}-${seq}`, githubId: `${TAG}${seq}`, githubUsername: `${TAG}gh${seq}`,
    githubTokenEnc: encryptToken('gho_fake'), ...data
  }
});

try {
  // Token storage
  const sealed = encryptToken('gho_secret');
  check('GitHub tokens are stored encrypted, not in plain text', !sealed.includes('gho_secret') && decryptToken(sealed) === 'gho_secret');
  const parts = sealed.split('.');
  parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA');
  check('a tampered stored token is rejected', decryptToken(parts.join('.')) === null);

  // A normal session
  const u = await makeUser();
  const token = createSessionToken(u.id, u.alias, u.sessionVersion);
  let r = await outcome(() => getSessionUser(reqWith(token), { write: true }));
  check('a valid GitHub sign-in can act', r.ok && calls === 1);
  check('GitHub confirmation time is recorded', Boolean((await prisma.user.findUnique({ where: { id: u.id } })).githubCheckedAt));

  calls = 0;
  await outcome(() => getSessionUser(reqWith(token)));
  check('page loads reuse a recent GitHub check (no extra GitHub call)', calls === 0);
  await outcome(() => getSessionUser(reqWith(token), { write: true }));
  check('every action asks GitHub again', calls === 1);

  // GitHub unreachable
  answer = 'unknown';
  r = await outcome(() => getSessionUser(reqWith(token), { write: true }));
  check('if GitHub cannot be reached, actions are refused (503), not trusted', !r.ok && r.status === 503);
  await prisma.user.update({ where: { id: u.id }, data: { githubCheckedAt: null } });
  r = await outcome(() => getSessionUser(reqWith(token)));
  check('...but pages still load', r.ok);

  // The reported bug: access revoked on GitHub while the site stays open
  answer = 'revoked';
  r = await outcome(() => getSessionUser(reqWith(token), { write: true }));
  check('after revoking access on GitHub, the next action is refused (401)', !r.ok && r.status === 401 && r.code === 'GITHUB_REVOKED', JSON.stringify(r));
  const afterRevoke = await prisma.user.findUnique({ where: { id: u.id } });
  check('the stored GitHub token is deleted', afterRevoke.githubTokenEnc === null);
  answer = 'valid';
  r = await outcome(() => getSessionUser(reqWith(token)));
  check('the old cookie stays dead, even for page loads', !r.ok && r.status === 401);
  process.env.GITHUB_SESSION_CHECKS = 'off';
  r = await outcome(() => getSessionUser(reqWith(token)));
  check('...even where GitHub checks are off (the session version changed)', !r.ok && r.status === 401);
  process.env.GITHUB_SESSION_CHECKS = 'on';

  // Signing in again works
  await prisma.user.update({ where: { id: u.id }, data: { githubTokenEnc: encryptToken('gho_fake') } });
  const fresh = createSessionToken(u.id, u.alias, afterRevoke.sessionVersion);
  r = await outcome(() => getSessionUser(reqWith(fresh), { write: true }));
  check('signing in with GitHub again works', r.ok);

  // Logout ends every device
  const otherDevice = createSessionToken(u.id, u.alias, afterRevoke.sessionVersion);
  await signOutEverywhere(u.id);
  r = await outcome(() => getSessionUser(reqWith(otherDevice)));
  check('signing out ends sessions on every device', !r.ok && r.status === 401);

  // Other refusals
  const v = await makeUser();
  r = await outcome(() => getSessionUser(reqWith(createSessionToken(v.id, v.alias, v.sessionVersion + 5))));
  check('a cookie with the wrong session version is refused', !r.ok && r.status === 401);
  const legacy = await makeUser();
  r = await outcome(() => getSessionUser(reqWith(createSessionToken(legacy.id, legacy.alias, null))));
  check('cookies from before this change (no version) are refused', !r.ok && r.status === 401);
  const noToken = await makeUser({ githubTokenEnc: null });
  r = await outcome(() => getSessionUser(reqWith(createSessionToken(noToken.id, noToken.alias, 0))));
  check('on the live site, an account with no GitHub token must sign in again', !r.ok && r.status === 401);
  const noGithub = await makeUser({ githubId: null, githubTokenEnc: null });
  r = await outcome(() => getSessionUser(reqWith(createSessionToken(noGithub.id, noGithub.alias, 0))));
  check('on the live site, password/demo accounts cannot act', !r.ok && r.status === 401);
  r = await outcome(() => getSessionUser({ headers: {} }));
  check('no cookie means signed out', !r.ok && r.status === 401);
  const forged = token.split('.')[0] + '.forgedsignature';
  r = await outcome(() => getSessionUser(reqWith(forged)));
  check('a forged cookie is refused', !r.ok && r.status === 401);

  // Requester profile for owners
  await prisma.commitment.create({ data: { projectId: (await prisma.project.create({ data: { title: `${TAG} p`, description: 'x', techTags: '[]', ownerId: v.id, source: 'DONATED' } })).id, takerId: u.id, status: 'GHOSTED' } });
  const profile = await requesterProfile(u.id);
  check('owners see the requester\'s GitHub link and record', profile.githubUrl === `https://github.com/${u.githubUsername}` && profile.record.ghosted === 1);
} catch (err) {
  console.error('Unexpected error:', err);
  fails++;
} finally {
  const ids = (await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } })).map(x => x.id);
  await prisma.commitment.deleteMany({ where: { takerId: { in: ids } } });
  await prisma.project.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : `\nAll ${n} session checks passed. Test data removed.`);
  process.exitCode = fails ? 1 : 0; // no process.exit(): it can crash Node on Windows while sockets close
}
