import prisma from '../../../lib/prisma';
import { requireUser, optionalUser } from '../../../lib/session';
import { reviversOf } from '../../../lib/revivers';
import { claimProject, approveRequest, endRequest, ClaimError } from '../../../lib/claims';
import { PLEDGE, PROOF_DAYS, REQUEST_DAYS, MIN_NEW_COMMITS } from '../../../lib/claimRules';
import { enrichProject } from '../../../lib/mockFallback';
import { analyzeGitHubRepository } from '../../../lib/githubIntelligence';
import { requesterProfile } from '../../../lib/requesterProfile';

/**
 * Unified Project Details & Actions Route Handler
 * Matches:
 *  - GET  /api/projects/:id
 *  - POST /api/projects/:id/commit    (claim; locks the pledge)
 *  - POST /api/projects/:id/approve   (donated: owner approves a request)
 *  - POST /api/projects/:id/reject    (donated: owner declines a request)
 *  - POST /api/projects/:id/analyze   (owner refreshes GitHub analysis)
 */
export default async function handler(req, res) {
  const { slug } = req.query;

  if (!slug || slug.length < 1) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  const projectId = slug[0];
  const action = slug[1];

  // If no sub-action, fetch project detail
  if (!action) {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    return handleGetProject(req, res, projectId);
  }

  switch (action) {
    case 'commit':
      return handleCommit(req, res, projectId);
    case 'approve':
      return handleApprove(req, res, projectId);
    case 'reject':
      return handleReject(req, res, projectId);
    case 'analyze':
      return handleAnalyze(req, res, projectId);
    default:
      return res.status(404).json({ error: `Action '${action}' not found for project` });
  }
}

async function handleAnalyze(req, res, id) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const me = await requireUser(req, res, { write: true });
    if (!me) return;
    const ownerId = me.id;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.ownerId !== ownerId) return res.status(403).json({ error: 'Only the project owner can analyze this repository' });
    if (!project.githubRepoUrl) return res.status(400).json({ error: 'This project has no GitHub repository URL' });

    const intelligence = await analyzeGitHubRepository(project.githubRepoUrl);
    const updatedProject = await prisma.project.update({ where: { id }, data: intelligence });
    return res.status(200).json({ project: updatedProject, message: 'GitHub repository intelligence refreshed successfully.' });
  } catch (err) {
    console.error('GitHub repository analysis error:', err);
    return res.status(502).json({ error: err.message || 'GitHub repository analysis failed' });
  }
}

// 1. GET /api/projects/:id
async function handleGetProject(req, res, id) {
  try {
    const currentUserId = (await optionalUser(req))?.id || null;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, alias: true, reputation: true, ghostStrikes: true }
        },
        commitments: {
          where: {
            status: { in: ['PENDING_APPROVAL', 'ACTIVE', 'SUBMITTED', 'COMPLETED'] }
          },
          orderBy: { committedAt: 'desc' },
          include: {
            taker: {
              select: { id: true, alias: true, reputation: true, ghostStrikes: true }
            }
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOpenGrave = project.source === 'OPEN_GRAVE';
    // Open graves can have many revivers, so "your" commitment is the one that matters.
    const activeCommitment = isOpenGrave
      ? (project.commitments.find(c => c.takerId === currentUserId && ['ACTIVE', 'COMPLETED'].includes(c.status)) || null)
      : (project.commitments.find(c => ['PENDING_APPROVAL', 'ACTIVE', 'SUBMITTED'].includes(c.status)) || project.commitments[0] || null);

    // An open grave's lister is its discoverer, not its owner: there is nothing for them to approve.
    const isOwner = !isOpenGrave && currentUserId === project.ownerId;
    const isTaker = Boolean(activeCommitment && currentUserId && currentUserId === activeCommitment.takerId);

    // The owner reviews who is asking before approving: their GitHub and their record here.
    const requester = isOwner && activeCommitment && ['PENDING_APPROVAL', 'ACTIVE'].includes(activeCommitment.status)
      ? await requesterProfile(activeCommitment.takerId)
      : null;

    return res.status(200).json({
      project: enrichProject(project),
      activeCommitment,
      revivers: isOpenGrave ? reviversOf(project.commitments) : [],
      userRole: isOwner ? 'OWNER' : isTaker ? 'TAKER' : 'GUEST',
      requester
    });
  } catch (err) {
    console.error('Error fetching project:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Claim actions all go through lib/claims.js, so the pledge rules live in one place.
function sendClaimError(res, err, fallback) {
  if (err instanceof ClaimError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: 'Internal server error' });
}

// 2. POST /api/projects/:id/commit  (claim)
async function handleCommit(req, res, id) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const me = await requireUser(req, res, { write: true });
  if (!me) return;
  const takerId = me.id;

  try {
    const { commitment, project } = await claimProject(id, takerId);
    const message = project.source === 'OPEN_GRAVE'
      ? `Claimed! ${PLEDGE} credits are pledged. Fork it and push a commit of your own within ${PROOF_DAYS} days; ${MIN_NEW_COMMITS} new commits finishes the revival. Quit any time to get the pledge back.`
      : `Request sent. ${PLEDGE} credits are pledged while the owner decides (up to ${REQUEST_DAYS} days). If they decline or don't answer, you get it back.`;
    return res.status(201).json({ commitment, message });
  } catch (err) {
    return sendClaimError(res, err, 'Claim error:');
  }
}

// 3. POST /api/projects/:id/approve  (donated: owner picks who gets the claim)
async function handleApprove(req, res, id) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const me = await requireUser(req, res, { write: true });
  if (!me) return;
  const ownerId = me.id;

  try {
    const commitment = await approveRequest(id, ownerId, (req.body || {}).commitmentId);
    return res.status(200).json({
      commitment,
      message: `Approved. Their ${PROOF_DAYS}-day check and claim deadline start now. GitHub, not you, confirms the finished work.`
    });
  } catch (err) {
    return sendClaimError(res, err, 'Approve error:');
  }
}

// 4. POST /api/projects/:id/reject  (donated: owner declines; the pledge goes back)
async function handleReject(req, res, id) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const me = await requireUser(req, res, { write: true });
  if (!me) return;
  const ownerId = me.id;

  try {
    const { commitmentId } = req.body || {};
    const pending = await prisma.commitment.findFirst({ where: { id: commitmentId || '', projectId: id } });
    if (!pending) return res.status(400).json({ error: 'Commitment not found' });
    await endRequest(pending.id, { byUserId: ownerId, asOwner: true, reason: 'the owner declined your request' });
    return res.status(200).json({ message: 'Request declined. Their pledge was returned and the project is listed again.' });
  } catch (err) {
    return sendClaimError(res, err, 'Reject error:');
  }
}
