// Tests the claim engine (lib/claims.js) directly against the database.
// Run against the LOCAL database only:
//   DATABASE_URL=postgresql://postgres:graveyard@localhost:5433/graveyard node scripts/test-claims.mjs
// It creates its own users and projects (prefixed "claimtest") and deletes them at the end.
import prisma from '../lib/prisma.js';
import {
  claimProject, approveRequest, endRequest, quitClaim, checkFork, runClaimCheckpoints, ClaimError
} from '../lib/claims.js';
import {
  STARTING_CREDITS, PLEDGE, REVIVE_REWARD, REVIVE_REP, GHOST_REP, PROOF_DAYS, REQUEST_DAYS, DAY_MS, MIN_NEW_COMMITS
} from '../lib/claimRules.js';

if (/neon|vercel|amazonaws/i.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL looks like a hosted database. Use the local one.');
  process.exit(1);
}

const TAG = `claimtest${Date.now()}`;
let fails = 0;
let n = 0;
const check = (name, ok, extra = '') => {
  n++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}. ${name}${!ok && extra ? `  -> ${extra}` : ''}`);
  if (!ok) fails++;
};
async function expectError(name, fn, status) {
  try {
    await fn();
    check(name, false, 'no error thrown');
  } catch (err) {
    check(name, err instanceof ClaimError && err.status === status, `${err.status} ${err.message}`);
  }
}
const user = id => prisma.user.findUnique({ where: { id } });
const project = id => prisma.project.findUnique({ where: { id } });
const commitment = id => prisma.commitment.findUnique({ where: { id } });
const later = days => new Date(Date.now() + days * DAY_MS + 60_000);

let seq = 0;
async function makeUser(opts = {}) {
  seq++;
  return prisma.user.create({
    data: {
      email: `${TAG}-${seq}@test.local`,
      alias: `${TAG}-${seq}`,
      credits: STARTING_CREDITS,
      githubUsername: `${TAG}-gh${seq}`,
      ...opts
    }
  });
}
async function makeProject(ownerId, source, opts = {}) {
  seq++;
  return prisma.project.create({
    data: {
      title: `${TAG} project ${seq}`,
      description: 'Claim engine test project',
      techTags: '[]',
      ownerId,
      source,
      status: 'LISTED',
      stakeRequired: PLEDGE,
      claimDays: 30,
      githubRepoUrl: `https://github.com/${TAG}/repo${seq}`,
      githubRepoName: `repo${seq}`,
      ...opts
    }
  });
}
// A stand-in for GitHub so the daily job can be tested without the network.
const forkWith = (newCommits, own) => async c => ({
  ok: true, forkUrl: `https://github.com/${c.taker.githubUsername}/${c.project.githubRepoName}`,
  newCommits, aheadBy: newCommits, own, commitAuthors: []
});
const noFork = async () => ({ ok: false, own: 0 });
const githubDown = async () => { throw new Error('GitHub timed out'); };
// Claims that aren't ours look like a GitHub outage, which the job leaves untouched.
const onlyOurs = fn => async c => {
  if (!c.project.title.startsWith(TAG)) throw new Error('not test data');
  return fn(c);
};
const runJob = (when, inspect) => runClaimCheckpoints(when, { inspectFork: onlyOurs(inspect) });

try {
  console.log(`\nRules: start ${STARTING_CREDITS}, pledge ${PLEDGE}, reward ${REVIVE_REWARD}, ${PROOF_DAYS}-day first commit, ${MIN_NEW_COMMITS} commits to finish\n`);
  check('500 starting credits cover 3 pledges at once, not 4', Math.floor(STARTING_CREDITS / PLEDGE) === 3);

  const owner = await makeUser();
  const alice = await makeUser();
  const bob = await makeUser();
  const noGithub = await makeUser({ githubUsername: null });
  const banned = await makeUser({ banned: true, ghostStrikes: 3 });
  const curator = await makeUser({ githubUsername: null });

  // ---- open grave: claim, join, double claim, quit
  const grave = await makeProject(curator.id, 'OPEN_GRAVE');
  const { commitment: a1 } = await claimProject(grave.id, alice.id);
  check(`claiming locks a ${PLEDGE}-credit pledge`, (await user(alice.id)).credits === STARTING_CREDITS - PLEDGE);
  check('open grave claim is ACTIVE with a 7-day check and a 30-day deadline',
    a1.status === 'ACTIVE' && Math.round((a1.proofDueAt - a1.committedAt) / DAY_MS) === PROOF_DAYS &&
    Math.round((a1.ghostDeadlineAt - a1.committedAt) / DAY_MS) === 30);
  check('open grave moves to ACTIVE', (await project(grave.id)).status === 'ACTIVE');
  await expectError('the same person cannot claim twice (409)', () => claimProject(grave.id, alice.id), 409);
  const { commitment: b1 } = await claimProject(grave.id, bob.id);
  check('a second person can join an open grave', b1.status === 'ACTIVE');
  await expectError('someone else cannot quit your claim (403)', () => quitClaim(a1.id, bob.id), 403);
  await quitClaim(b1.id, bob.id);
  const bobAfterQuit = await user(bob.id);
  check('quitting returns the full pledge with no penalty',
    bobAfterQuit.credits === STARTING_CREDITS && bobAfterQuit.ghostStrikes === 0 && bobAfterQuit.reputation === bob.reputation);
  await expectError('quitting twice does not refund twice (400)', () => quitClaim(b1.id, bob.id), 400);
  check('balance unchanged after the second quit attempt', (await user(bob.id)).credits === STARTING_CREDITS);

  // ---- refusals
  await expectError('no linked GitHub account cannot claim (403)', () => claimProject(grave.id, noGithub.id), 403);
  await expectError('a banned user cannot claim (403)', () => claimProject(grave.id, banned.id), 403);
  const poor = await makeUser({ credits: PLEDGE - 1 });
  await expectError('fewer credits than the pledge cannot claim (400)', () => claimProject(grave.id, poor.id), 400);
  check('a refused claim takes no credits and creates no claim',
    (await user(poor.id)).credits === PLEDGE - 1 &&
    (await prisma.commitment.count({ where: { takerId: poor.id } })) === 0);
  const noRepo = await makeProject(curator.id, 'OPEN_GRAVE', { githubRepoUrl: null });
  await expectError('a listing without a repo cannot be claimed (400)', () => claimProject(noRepo.id, bob.id), 400);

  // ---- a fourth pledge is refused while three are open
  const busy = await makeUser();
  const g2 = await makeProject(curator.id, 'OPEN_GRAVE');
  const g3 = await makeProject(curator.id, 'OPEN_GRAVE');
  const g4 = await makeProject(curator.id, 'OPEN_GRAVE');
  await claimProject(grave.id, busy.id);
  await claimProject(g2.id, busy.id);
  await claimProject(g3.id, busy.id);
  await expectError('a 4th claim at once is refused (only 50 credits left)', () => claimProject(g4.id, busy.id), 400);
  check('balance never goes negative', (await user(busy.id)).credits === STARTING_CREDITS - 3 * PLEDGE);

  // ---- two claims at the same moment on one donated project: exactly one wins
  const raceOwner = await makeUser();
  const race = await makeProject(raceOwner.id, 'DONATED');
  const r1 = await makeUser();
  const r2 = await makeUser();
  const results = await Promise.allSettled([claimProject(race.id, r1.id), claimProject(race.id, r2.id)]);
  const wins = results.filter(r => r.status === 'fulfilled').length;
  const charged = [(await user(r1.id)).credits, (await user(r2.id)).credits].filter(c => c < STARTING_CREDITS).length;
  check('two simultaneous requests for one donated project: one wins, one is charged', wins === 1 && charged === 1,
    `wins=${wins} charged=${charged}`);

  // ---- donated: request, decline, cancel, approve
  const donated = await makeProject(owner.id, 'DONATED');
  await expectError('the owner cannot claim their own project (400)', () => claimProject(donated.id, owner.id), 400);
  const { commitment: req1 } = await claimProject(donated.id, alice.id);
  check('a donated request waits for the owner with a 3-day window',
    req1.status === 'PENDING_APPROVAL' && Math.round((req1.requestExpiresAt - req1.committedAt) / DAY_MS) === REQUEST_DAYS &&
    (await project(donated.id)).status === 'PENDING_APPROVAL');
  await expectError('a second request while one is pending is refused (409)', () => claimProject(donated.id, bob.id), 409);
  await expectError('someone other than the owner cannot approve (403)', () => approveRequest(donated.id, bob.id, req1.id), 403);
  await expectError('someone other than the owner cannot decline (403)',
    () => endRequest(req1.id, { byUserId: bob.id, asOwner: true, reason: 'test' }), 403);
  const aliceBefore = (await user(alice.id)).credits;
  await endRequest(req1.id, { byUserId: owner.id, asOwner: true, reason: 'declined in test' });
  check('a declined request returns the pledge and relists the project',
    (await user(alice.id)).credits === aliceBefore + PLEDGE && (await project(donated.id)).status === 'LISTED');

  const { commitment: req2 } = await claimProject(donated.id, bob.id);
  await endRequest(req2.id, { byUserId: bob.id, reason: 'cancelled in test' });
  check('the requester can cancel and gets the pledge back', (await user(bob.id)).credits === STARTING_CREDITS);

  const { commitment: req3 } = await claimProject(donated.id, bob.id);
  const approved = await approveRequest(donated.id, owner.id, req3.id);
  check('approval starts the 7-day and 30-day clocks from approval',
    approved.status === 'ACTIVE' && approved.proofDueAt && approved.ghostDeadlineAt && (await project(donated.id)).status === 'ACTIVE');
  await expectError('approving twice is refused (400)', () => approveRequest(donated.id, owner.id, req3.id), 400);

  // ---- checkFork refusals (no network needed)
  await expectError('someone else cannot check your fork (403)', () => checkFork(req3.id, alice.id, 'https://github.com/x/y'), 403);
  await expectError('checking a finished claim is refused (400)', () => checkFork(b1.id, bob.id, 'https://github.com/x/y'), 400);

  // ---- request expiry via the daily job
  const expOwner = await makeUser();
  const expProject = await makeProject(expOwner.id, 'DONATED');
  const expTaker = await makeUser();
  const { commitment: req4 } = await claimProject(expProject.id, expTaker.id);
  let run = await runJob(later(REQUEST_DAYS), noFork);
  check('an unanswered request expires after 3 days with the pledge returned',
    (await commitment(req4.id)).status === 'CANCELLED' && (await user(expTaker.id)).credits === STARTING_CREDITS &&
    (await project(expProject.id)).status === 'LISTED', run.log.join(' | '));

  // ---- day-7 checkpoint
  const ghost = await makeUser();
  const g7 = await makeProject(curator.id, 'OPEN_GRAVE');
  const { commitment: gc } = await claimProject(g7.id, ghost.id);
  await runJob(later(PROOF_DAYS - 2), noFork);
  check('nothing happens before day 7', (await commitment(gc.id)).status === 'ACTIVE');
  await runJob(later(PROOF_DAYS), githubDown);
  check('a GitHub outage never penalises anyone (checked again next day)', (await commitment(gc.id)).status === 'ACTIVE');
  await runJob(later(PROOF_DAYS), forkWith(2, 0));
  check('commits by other people do not pass the day-7 check',
    (await commitment(gc.id)).status === 'GHOSTED');
  const ghostAfter = await user(ghost.id);
  check(`a ghost loses the pledge, ${GHOST_REP} rep (floored at 0) and gets 1 strike`,
    ghostAfter.credits === STARTING_CREDITS - PLEDGE && ghostAfter.ghostStrikes === 1 && ghostAfter.reputation === Math.max(0, ghost.reputation + GHOST_REP));
  check('the lost pledge goes to the project bounty, never to the owner',
    (await project(g7.id)).bounty === PLEDGE && (await user(curator.id)).credits === STARTING_CREDITS);
  check('the open grave is free again', (await project(g7.id)).status === 'LISTED');

  const worker = await makeUser();
  const { commitment: wc } = await claimProject(g4.id, worker.id);
  await runJob(later(PROOF_DAYS), forkWith(1, 1));
  const wcAfter = await commitment(wc.id);
  check('one own commit passes the day-7 check', wcAfter.status === 'ACTIVE' && wcAfter.proofAt);
  await runJob(later(PROOF_DAYS + 1), noFork);
  check('a passed day-7 check is not repeated', (await commitment(wc.id)).status === 'ACTIVE');

  // ---- a revived donated project: paid by the job even if never submitted; owner gets reputation only
  const dOwner = await makeUser();
  const dTaker = await makeUser();
  const dProject = await makeProject(dOwner.id, 'DONATED');
  const { commitment: dReq } = await claimProject(dProject.id, dTaker.id);
  await approveRequest(dProject.id, dOwner.id, dReq.id);
  await runJob(later(PROOF_DAYS), c => (c.id === dReq.id ? forkWith(MIN_NEW_COMMITS, 3)(c) : Promise.reject(new Error('skip'))));
  const dOwnerAfter = await user(dOwner.id);
  check('a revived donated project pays the reviver and gives the owner reputation, not credits',
    (await commitment(dReq.id)).status === 'COMPLETED' &&
    (await user(dTaker.id)).credits === STARTING_CREDITS + REVIVE_REWARD &&
    dOwnerAfter.reputation === dOwner.reputation + REVIVE_REP && dOwnerAfter.credits === STARTING_CREDITS &&
    (await project(dProject.id)).status === 'COMPLETED');
  await expectError('a revived donated project cannot be claimed again (409)', () => claimProject(dProject.id, alice.id), 409);

  // ---- deadline
  await runJob(later(31), forkWith(2, 2));
  check('reaching the deadline short of 3 commits releases the claim as a ghost', (await commitment(wc.id)).status === 'GHOSTED');

  // ---- auto-complete with the bounty (g7 holds a bounty from the ghost above)
  const finisher = await makeUser();
  const { commitment: fc } = await claimProject(g7.id, finisher.id);
  await runJob(later(PROOF_DAYS), forkWith(MIN_NEW_COMMITS, 1));
  const finisherAfter = await user(finisher.id);
  check(`3+ commits finish the revival: pledge back + ${REVIVE_REWARD} + the ${PLEDGE} bounty`,
    (await commitment(fc.id)).status === 'COMPLETED' &&
    finisherAfter.credits === STARTING_CREDITS + REVIVE_REWARD + PLEDGE &&
    finisherAfter.reputation === finisher.reputation + REVIVE_REP);
  const g7After = await project(g7.id);
  check('the bounty is paid once and the grave is marked revived', g7After.bounty === 0 && g7After.status === 'COMPLETED' && g7After.revivedRepoUrl);
  await runJob(later(PROOF_DAYS + 1), forkWith(MIN_NEW_COMMITS, 1));
  check('running the daily job again pays nothing extra', (await user(finisher.id)).credits === finisherAfter.credits);
  await expectError('a reviver cannot claim the same project again (409)', () => claimProject(g7.id, finisher.id), 409);

  // ---- three strikes
  const serial = await makeUser({ ghostStrikes: 2 });
  const g8 = await makeProject(curator.id, 'OPEN_GRAVE');
  await claimProject(g8.id, serial.id);
  await runJob(later(PROOF_DAYS), noFork);
  const serialAfter = await user(serial.id);
  check('a 3rd missed claim bans the user from claiming', serialAfter.ghostStrikes === 3 && serialAfter.banned);
  await expectError('...and their next claim is refused (403)', () => claimProject(g8.id, serial.id), 403);

  // ---- older claims from before pledges expire quietly
  const legacyUser = await makeUser();
  const g9 = await makeProject(curator.id, 'OPEN_GRAVE', { status: 'ACTIVE' });
  const legacy = await prisma.commitment.create({
    data: { projectId: g9.id, takerId: legacyUser.id, status: 'ACTIVE', stakeLocked: 0, committedAt: new Date(), ghostDeadlineAt: new Date() }
  });
  await runJob(later(1), noFork);
  const legacyAfter = await user(legacyUser.id);
  check('a pre-pledge claim past its deadline expires with no penalty',
    (await commitment(legacy.id)).status === 'EXPIRED' && legacyAfter.ghostStrikes === 0 && legacyAfter.credits === STARTING_CREDITS);

  // ---- every credit is accounted for in the ledger
  const testUsers = await prisma.user.findMany({ where: { email: { startsWith: TAG } } });
  let mismatches = 0;
  for (const u of testUsers) {
    const sum = await prisma.ledgerEntry.aggregate({ where: { userId: u.id }, _sum: { amount: true } });
    const start = u.id === poor.id ? PLEDGE - 1 : STARTING_CREDITS;
    if (start + (sum._sum.amount || 0) !== u.credits) mismatches++;
  }
  check('every balance equals its starting credits plus its ledger entries', mismatches === 0, `${mismatches} mismatched`);
} catch (err) {
  console.error('Unexpected error:', err);
  fails++;
} finally {
  const users = await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } });
  const ids = users.map(u => u.id);
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.commitment.deleteMany({ where: { takerId: { in: ids } } });
  await prisma.project.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : `\nAll ${n} claim checks passed. Test data removed.`);
  process.exit(fails ? 1 : 0);
}
