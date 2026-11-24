import { parseSession } from '../../../lib/auth';
import { checkFork, quitClaim, endRequest, ClaimError } from '../../../lib/claims';

/**
 * Claim actions for the person who claimed (all rules live in lib/claims.js):
 *  - POST /api/commitments/:id/submit    check my fork: records progress, or finishes the revival
 *  - POST /api/commitments/:id/withdraw  quit an active claim, or cancel a pending request (pledge returned)
 *
 * There is no owner "verify" step: GitHub's commit history decides whether a revival is done,
 * so nobody can withhold a reward or keep someone else's pledge.
 */
export default async function handler(req, res) {
  const { slug } = req.query;
  if (!slug || slug.length < 2) return res.status(404).json({ error: 'Endpoint not found' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = parseSession(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized. Please log in.' });

  const [commitmentId, action] = slug;
  try {
    if (action === 'submit') {
      const { deliverableUrl, forkUrl } = req.body || {};
      const result = await checkFork(commitmentId, userId, forkUrl || deliverableUrl);
      return res.status(200).json({
        message: result.message,
        completed: result.completed,
        verification: result.check
      });
    }

    if (action === 'withdraw') {
      try {
        await quitClaim(commitmentId, userId);
        return res.status(200).json({ message: 'You quit this claim. Your pledge is back, with no penalty.' });
      } catch (err) {
        // Not active: maybe it's a request the owner hasn't answered yet.
        if (!(err instanceof ClaimError) || err.status !== 400) throw err;
        await endRequest(commitmentId, { byUserId: userId, reason: 'you cancelled your request' });
        return res.status(200).json({ message: 'Request cancelled. Your pledge is back.' });
      }
    }

    return res.status(404).json({ error: `Action '${slug.slice(1).join('/')}' not found for commitment` });
  } catch (err) {
    if (err instanceof ClaimError) return res.status(err.status).json({ error: err.message });
    console.error('Commitment action error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
