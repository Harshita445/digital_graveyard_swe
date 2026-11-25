import prisma from './prisma.js';
import { recordLedgerEntry } from './ledger.js';
import { verifyRevivalFork } from './githubIntelligence.js';
import {
  PLEDGE, REVIVE_REWARD, REVIVE_REP, GHOST_REP, PROOF_DAYS, REQUEST_DAYS,
  DEFAULT_CLAIM_DAYS, MIN_NEW_COMMITS, DAY_MS
} from './claimRules.js';

// Every claim follows the same life:
//   claim (pledge locked) -> [donated only: owner approves within 3 days]
//   -> ACTIVE: first own commit on a fork within 7 days, 3+ new commits before the deadline
//   -> COMPLETED (pledge back + reward + bounty) | CANCELLED (quit, pledge back) | GHOSTED (pledge -> bounty)
// Every money step runs in one serializable transaction and moves a status with a guarded
// update, so a double click or a race with the daily job can't pay out or refund twice.

export class ClaimError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const OPEN_STATUSES = ['PENDING_APPROVAL', 'ACTIVE'];

// Serializable transactions can be refused when two of them touch the same rows (P2034).
// That is safe to retry: nothing was written. Retrying here means a quit or cancel doesn't
// fail with "try again" (leaving the pledge locked) just because something else ran at that moment.
async function inTx(work, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (err) {
      if (err instanceof ClaimError) throw err;
      if (err?.code !== 'P2034') throw err;
      if (attempt >= attempts) {
        throw new ClaimError(409, 'Someone else changed this project at the same moment. Please try again.');
      }
      await new Promise(r => setTimeout(r, 50 * attempt + Math.random() * 100));
    }
  }
}

// Moves a commitment from one status to another only if it is still in the expected status.
async function moveStatus(tx, id, from, data) {
  const moved = await tx.commitment.updateMany({ where: { id, status: { in: [].concat(from) } }, data });
  if (moved.count === 0) throw new ClaimError(409, 'This claim has already changed. Refresh the page.');
}

// Open graves are LISTED, ACTIVE while someone works on them, and stay COMPLETED once revived.
async function refreshOpenGrave(tx, projectId) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (!project || project.status === 'COMPLETED') return;
  const working = await tx.commitment.count({ where: { projectId, status: 'ACTIVE' } });
  await tx.project.update({ where: { id: projectId }, data: { status: working > 0 ? 'ACTIVE' : 'LISTED' } });
}

async function settleProjectAfterClaimEnds(tx, project) {
  if (project.source === 'OPEN_GRAVE') return refreshOpenGrave(tx, project.id);
  if (project.status !== 'COMPLETED') {
    await tx.project.update({ where: { id: project.id }, data: { status: 'LISTED' } });
  }
}

function refund(tx, commitment, notes) {
  if (!commitment.stakeLocked) return null;
  return recordLedgerEntry({
    tx, userId: commitment.takerId, type: 'STAKE_REFUND', amount: commitment.stakeLocked,
    relatedProjectId: commitment.projectId, relatedCommitmentId: commitment.id, notes
  });
}

// ---------------------------------------------------------------- claim

export async function claimProject(projectId, userId) {
  return inTx(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new ClaimError(404, 'User not found.');
    if (user.banned) {
      throw new ClaimError(403, 'You left 3 claims without finishing or quitting, so you can\'t claim new projects.');
    }
    if (!user.githubUsername) {
      throw new ClaimError(403, 'Connect your GitHub account first: your commits are how we check progress.');
    }

    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new ClaimError(404, 'Project not found.');
    if (!project.githubRepoUrl) throw new ClaimError(400, 'This listing has no GitHub repository, so it can\'t be claimed.');
    const isOpenGrave = project.source === 'OPEN_GRAVE';
    if (!isOpenGrave && project.ownerId === userId) throw new ClaimError(400, 'You can\'t claim your own project.');
    if (!isOpenGrave && project.status === 'COMPLETED') throw new ClaimError(409, 'This project has already been revived.');

    const mine = await tx.commitment.findFirst({
      where: { projectId, takerId: userId, status: { in: [...OPEN_STATUSES, 'COMPLETED'] } }
    });
    if (mine?.status === 'COMPLETED') {
      throw new ClaimError(409, 'You already revived this project. Keep pushing to your fork; the revival stays credited to you.');
    }
    if (mine) throw new ClaimError(409, 'You already have a claim on this project.');

    // A donated project goes to one person at a time.
    if (!isOpenGrave) {
      const taken = await tx.project.updateMany({ where: { id: projectId, status: 'LISTED' }, data: { status: 'PENDING_APPROVAL' } });
      if (taken.count === 0) throw new ClaimError(409, 'Someone else has a claim on this project right now.');
    }

    // Lock the pledge only if the balance covers it (never goes negative).
    const locked = await tx.user.updateMany({
      where: { id: userId, credits: { gte: PLEDGE } },
      data: { credits: { decrement: PLEDGE } }
    });
    if (locked.count === 0) {
      throw new ClaimError(400, `Claiming needs a ${PLEDGE}-credit pledge, and you have ${user.credits}. Finish a revival or quit a claim to free credits.`);
    }

    const now = new Date();
    const claimDays = project.claimDays || DEFAULT_CLAIM_DAYS;
    const commitment = await tx.commitment.create({
      data: {
        projectId,
        takerId: userId,
        status: isOpenGrave ? 'ACTIVE' : 'PENDING_APPROVAL',
        stakeLocked: PLEDGE,
        committedAt: now,
        approvedAt: isOpenGrave ? now : null,
        proofDueAt: isOpenGrave ? new Date(now.getTime() + PROOF_DAYS * DAY_MS) : null,
        ghostDeadlineAt: isOpenGrave ? new Date(now.getTime() + claimDays * DAY_MS) : null,
        requestExpiresAt: isOpenGrave ? null : new Date(now.getTime() + REQUEST_DAYS * DAY_MS)
      }
    });
    await tx.ledgerEntry.create({
      data: {
        userId, type: 'STAKE_LOCK', amount: -PLEDGE, relatedProjectId: projectId, relatedCommitmentId: commitment.id,
        notes: `Pledged ${PLEDGE} credits to claim ${project.title}. Returned when you finish or quit.`
      }
    });
    if (isOpenGrave) await refreshOpenGrave(tx, projectId);
    return { commitment, project };
  });
}

// ---------------------------------------------------------------- donated requests

export async function approveRequest(projectId, ownerId, commitmentId) {
  return inTx(async tx => {
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new ClaimError(404, 'Project not found.');
    if (project.source === 'OPEN_GRAVE' || project.ownerId !== ownerId) {
      throw new ClaimError(403, 'Only the owner of a donated project can approve claims.');
    }
    const commitment = await tx.commitment.findFirst({ where: { id: commitmentId, projectId } });
    if (!commitment || commitment.status !== 'PENDING_APPROVAL') throw new ClaimError(400, 'There is no pending request to approve.');

    const now = new Date();
    await moveStatus(tx, commitment.id, 'PENDING_APPROVAL', {
      status: 'ACTIVE',
      approvedAt: now,
      requestExpiresAt: null,
      proofDueAt: new Date(now.getTime() + PROOF_DAYS * DAY_MS),
      ghostDeadlineAt: new Date(now.getTime() + (project.claimDays || DEFAULT_CLAIM_DAYS) * DAY_MS)
    });
    await tx.project.update({ where: { id: projectId }, data: { status: 'ACTIVE' } });
    return tx.commitment.findUnique({ where: { id: commitment.id } });
  });
}

// Owner declines, the requester cancels, or the request expires: the pledge comes back in full.
export async function endRequest(commitmentId, { byUserId = null, asOwner = false, reason }) {
  return inTx(async tx => {
    const commitment = await tx.commitment.findUnique({ where: { id: commitmentId }, include: { project: true } });
    if (!commitment) throw new ClaimError(404, 'Claim not found.');
    if (byUserId) {
      const allowed = asOwner ? commitment.project.ownerId === byUserId : commitment.takerId === byUserId;
      if (!allowed) throw new ClaimError(403, asOwner ? 'Only the project owner can decline requests.' : 'You can only cancel your own request.');
    }
    if (commitment.status !== 'PENDING_APPROVAL') throw new ClaimError(400, 'This request is no longer pending.');

    await moveStatus(tx, commitment.id, 'PENDING_APPROVAL', { status: 'CANCELLED', resolvedAt: new Date() });
    await refund(tx, commitment, `Pledge returned: ${reason}`);
    await settleProjectAfterClaimEnds(tx, commitment.project);
    return commitment;
  });
}

// ---------------------------------------------------------------- quitting

export async function quitClaim(commitmentId, userId) {
  return inTx(async tx => {
    const commitment = await tx.commitment.findUnique({ where: { id: commitmentId }, include: { project: true } });
    if (!commitment) throw new ClaimError(404, 'Claim not found.');
    if (commitment.takerId !== userId) throw new ClaimError(403, 'You can only quit your own claim.');
    if (commitment.status !== 'ACTIVE') throw new ClaimError(400, `This claim is ${commitment.status.toLowerCase()}, so there is nothing to quit.`);

    await moveStatus(tx, commitment.id, 'ACTIVE', { status: 'CANCELLED', resolvedAt: new Date() });
    await refund(tx, commitment, `Pledge returned: you quit ${commitment.project.title} honestly`);
    await settleProjectAfterClaimEnds(tx, commitment.project);
    return commitment;
  });
}

// ---------------------------------------------------------------- progress and completion

function countOwn(check, githubUsername) {
  const me = (githubUsername || '').toLowerCase();
  return (check.commitAuthors || []).filter(a => a.toLowerCase() === me).length;
}

async function completeInTx(tx, commitment, check, now) {
  await moveStatus(tx, commitment.id, 'ACTIVE', {
    status: 'COMPLETED', submittedAt: now, resolvedAt: now, forkUrl: check.forkUrl, submissionUrl: check.forkUrl,
    proofAt: commitment.proofAt || now,
    submissionNotes: `Verified fork ${check.forkUrl}: ${check.newCommits} new commit(s) since the claim, ${check.aheadBy} ahead of the original.`
  });
  const project = await tx.project.findUnique({ where: { id: commitment.projectId } });

  await refund(tx, commitment, `Pledge returned: you revived ${project.title}`);
  await recordLedgerEntry({
    tx, userId: commitment.takerId, type: 'REWARD_CREDIT', amount: REVIVE_REWARD, repDelta: REVIVE_REP,
    relatedProjectId: project.id, relatedCommitmentId: commitment.id,
    notes: `Revived ${project.title} (${check.newCommits} new commits)`
  });

  // Pledges lost by people who disappeared go to whoever revives the project next.
  let bounty = 0;
  if (project.bounty > 0) {
    const taken = await tx.project.updateMany({ where: { id: project.id, bounty: project.bounty }, data: { bounty: 0 } });
    if (taken.count === 1) {
      bounty = project.bounty;
      await recordLedgerEntry({
        tx, userId: commitment.takerId, type: 'REWARD_CREDIT', amount: bounty,
        relatedProjectId: project.id, relatedCommitmentId: commitment.id,
        notes: `Bounty for ${project.title}: pledges left behind by earlier claimers`
      });
    }
  }

  await tx.project.update({
    where: { id: project.id },
    data: {
      status: 'COMPLETED',
      revivedRepoUrl: project.revivedRepoUrl || check.forkUrl,
      reviewTimeoutAt: null,
      ...(project.source === 'DONATED' ? { completion: 100 } : {})
    }
  });
  if (project.source === 'DONATED') {
    await recordLedgerEntry({
      tx, userId: project.ownerId, type: 'REP_DELTA', repDelta: REVIVE_REP,
      relatedProjectId: project.id, relatedCommitmentId: commitment.id,
      notes: `Your project ${project.title} was revived`
    });
  }
  return { bounty };
}

/**
 * The reviver points us at their fork. GitHub decides the rest:
 *   - one of their own commits since the claim  -> progress recorded (passes the 7-day check)
 *   - MIN_NEW_COMMITS new commits, one theirs    -> revived and paid out
 * Throws ClaimError for anything the user can fix; GitHub outages surface as 502.
 */
export async function checkFork(commitmentId, userId, forkUrlInput) {
  const commitment = await prisma.commitment.findUnique({
    where: { id: commitmentId }, include: { project: true, taker: true }
  });
  if (!commitment) throw new ClaimError(404, 'Claim not found.');
  if (commitment.takerId !== userId) throw new ClaimError(403, 'You can only check your own claim.');
  if (commitment.status !== 'ACTIVE') throw new ClaimError(400, `This claim is ${commitment.status.toLowerCase()}, not active.`);

  const forkUrl = String(forkUrlInput || commitment.forkUrl || '').trim();
  if (!forkUrl) throw new ClaimError(400, 'Paste the GitHub URL of your fork.');

  let check;
  try {
    check = await verifyRevivalFork(commitment.project.githubRepoUrl, forkUrl, commitment.committedAt);
  } catch (err) {
    throw new ClaimError(502, 'Could not reach GitHub to check your fork. Please try again in a minute.');
  }
  if (!check.ok) throw new ClaimError(400, check.reason);

  const own = countOwn(check, commitment.taker.githubUsername);
  if (own === 0) {
    throw new ClaimError(400, `None of the new commits in that fork were made by @${commitment.taker.githubUsername}. Push a commit of your own (with an email linked to your GitHub account), then check again.`);
  }

  const now = new Date();
  if (check.newCommits >= MIN_NEW_COMMITS) {
    const { bounty } = await inTx(tx => completeInTx(tx, commitment, check, now));
    return {
      completed: true,
      check,
      message: `Revived! ${check.newCommits} new commits verified. Your ${commitment.stakeLocked} pledge is back, plus ${REVIVE_REWARD} credits${bounty ? ` and a ${bounty}-credit bounty` : ''}.`
    };
  }

  await inTx(async tx => {
    await moveStatus(tx, commitment.id, 'ACTIVE', { forkUrl: check.forkUrl, proofAt: commitment.proofAt || now });
  });
  return {
    completed: false,
    check,
    message: `Progress saved: ${check.newCommits} of ${MIN_NEW_COMMITS} new commits. Your 7-day check is done. Check again once you reach ${MIN_NEW_COMMITS}.`
  };
}

// ---------------------------------------------------------------- the daily job

async function releaseAsGhost(commitment, now, why) {
  return inTx(async tx => {
    const legacy = !commitment.stakeLocked && !commitment.proofDueAt;
    await moveStatus(tx, commitment.id, 'ACTIVE', { status: legacy ? 'EXPIRED' : 'GHOSTED', resolvedAt: now });
    if (!legacy) {
      if (commitment.stakeLocked > 0) {
        await tx.project.update({ where: { id: commitment.projectId }, data: { bounty: { increment: commitment.stakeLocked } } });
      }
      await recordLedgerEntry({
        tx, userId: commitment.takerId, type: 'STAKE_FORFEIT', amount: 0, repDelta: GHOST_REP, strikeDelta: 1,
        relatedProjectId: commitment.projectId, relatedCommitmentId: commitment.id,
        notes: `${why}. Your ${commitment.stakeLocked}-credit pledge went to the project's bounty for the next reviver`
      });
    }
    await settleProjectAfterClaimEnds(tx, commitment.project);
    return legacy;
  });
}

// Looks at the reviver's fork: the one they gave us, or github.com/<their login>/<repo name>.
async function lookAtFork(commitment) {
  const guess = commitment.taker.githubUsername && commitment.project.githubRepoName
    ? `https://github.com/${commitment.taker.githubUsername}/${commitment.project.githubRepoName}`
    : null;
  const forkUrl = commitment.forkUrl || guess;
  if (!forkUrl) return { ok: false, own: 0 };
  const check = await verifyRevivalFork(commitment.project.githubRepoUrl, forkUrl, commitment.committedAt);
  return { ...check, own: check.ok ? countOwn(check, commitment.taker.githubUsername) : 0 };
}

/**
 * Runs every day. `now` can be shifted for local testing. `inspectFork` is replaceable in tests.
 * A GitHub outage never punishes anyone: that claim is simply checked again the next day.
 */
export async function runClaimCheckpoints(now = new Date(), { inspectFork = lookAtFork } = {}) {
  const log = [];
  const include = { project: true, taker: true };

  // 1. Donated requests the owner never answered.
  const staleRequests = await prisma.commitment.findMany({
    where: { status: 'PENDING_APPROVAL', requestExpiresAt: { lte: now } }, include
  });
  for (const c of staleRequests) {
    try {
      await endRequest(c.id, { reason: `the owner did not answer within the request window for ${c.project.title}` });
      log.push(`[REQUEST EXPIRED] ${c.taker.alias}'s request for "${c.project.title}" expired; pledge returned.`);
    } catch (err) { log.push(`[SKIPPED] ${c.id}: ${err.message}`); }
  }

  // 2. Active claims at their 7-day check or their deadline.
  const due = await prisma.commitment.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { proofAt: null, proofDueAt: { lte: now } },
        { ghostDeadlineAt: { lte: now } }
      ]
    },
    include
  });

  for (const c of due) {
    const atDeadline = c.ghostDeadlineAt && c.ghostDeadlineAt <= now;
    const legacy = !c.stakeLocked && !c.proofDueAt;
    try {
      if (legacy) {
        await releaseAsGhost(c, now, 'Claim lapsed');
        log.push(`[CLAIM EXPIRED] ${c.taker.alias}'s older claim on "${c.project.title}" lapsed. No penalty.`);
        continue;
      }

      let fork;
      try {
        fork = await inspectFork(c);
      } catch (githubError) {
        log.push(`[RETRY TOMORROW] Could not reach GitHub for "${c.project.title}": ${githubError.message}`);
        continue;
      }

      // Did the work but forgot to submit: count it.
      if (fork.ok && fork.own > 0 && fork.newCommits >= MIN_NEW_COMMITS) {
        const fresh = await prisma.commitment.findUnique({ where: { id: c.id } });
        if (fresh.status !== 'ACTIVE') continue;
        await inTx(tx => completeInTx(tx, fresh, fork, now));
        log.push(`[REVIVED] ${c.taker.alias}'s fork of "${c.project.title}" has ${fork.newCommits} new commits. Paid out automatically.`);
        continue;
      }

      if (atDeadline) {
        await releaseAsGhost(c, now, `The ${c.project.claimDays || DEFAULT_CLAIM_DAYS}-day claim on ${c.project.title} ended without a finished revival`);
        log.push(`[DEADLINE] ${c.taker.alias}'s claim on "${c.project.title}" ended unfinished. Pledge moved to the bounty.`);
      } else if (fork.ok && fork.own > 0) {
        await prisma.commitment.updateMany({ where: { id: c.id, status: 'ACTIVE' }, data: { proofAt: now, forkUrl: fork.forkUrl } });
        log.push(`[DAY ${PROOF_DAYS} OK] ${c.taker.alias} has a commit on "${c.project.title}".`);
      } else {
        await releaseAsGhost(c, now, `No commit of yours on a fork of ${c.project.title} within ${PROOF_DAYS} days`);
        log.push(`[DAY ${PROOF_DAYS} MISSED] ${c.taker.alias} showed no work on "${c.project.title}". Claim released, pledge moved to the bounty.`);
      }
    } catch (err) {
      log.push(`[SKIPPED] ${c.id}: ${err.message}`);
    }
  }

  return { log, requestsExpired: staleRequests.length, claimsChecked: due.length };
}
