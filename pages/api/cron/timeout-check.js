import prisma from '../../../lib/prisma';
import { analyzeGitHubRepository } from '../../../lib/githubIntelligence';
import { runClaimCheckpoints } from '../../../lib/claims';

// Daily job (Vercel Cron, midnight UTC):
//   1. refresh each listed repo's GitHub analysis
//   2. run the claim checkpoints: expire unanswered requests, the 7-day commit check, deadlines
export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { simulateDaysElapsed = 0, skipRefresh = false } = req.body || req.query || {};

    // Real runs: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
    // Time travel changes real claims, so it only runs locally (or with ALLOW_SIMULATION=true).
    const validSecret = process.env.CRON_SECRET;
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const isCron = Boolean(validSecret) && (bearer === validSecret || req.headers['x-cron-secret'] === validSecret);
    const simulationAllowed = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SIMULATION === 'true';

    if (!isCron && !simulationAllowed) {
      return res.status(401).json({ error: 'Simulation is disabled on the live site. Run the app locally to try it.' });
    }
    if (isCron && Number(simulateDaysElapsed) !== 0 && !simulationAllowed) {
      return res.status(400).json({ error: 'Time-travel is not allowed in production.' });
    }

    const effectiveNow = new Date(Date.now() + Number(simulateDaysElapsed) * 24 * 60 * 60 * 1000);
    const log = [];

    let refreshedRepositories = 0;
    if (!skipRefresh || skipRefresh === 'false') {
      const analyzedProjects = await prisma.project.findMany({
        where: { githubRepoUrl: { not: null }, githubAnalyzedAt: { not: null } },
        select: { id: true, title: true, githubRepoUrl: true }
      });
      for (const project of analyzedProjects) {
        try {
          const intelligence = await analyzeGitHubRepository(project.githubRepoUrl);
          await prisma.project.update({ where: { id: project.id }, data: intelligence });
          refreshedRepositories += 1;
        } catch (analysisError) {
          log.push(`[GITHUB] Could not refresh "${project.title}": ${analysisError.message}`);
        }
      }
    }

    const checkpoints = await runClaimCheckpoints(effectiveNow);

    return res.status(200).json({
      success: true,
      effectiveDate: effectiveNow.toISOString(),
      refreshedRepositories,
      requestsExpired: checkpoints.requestsExpired,
      claimsChecked: checkpoints.claimsChecked,
      events: [...log, ...checkpoints.log]
    });
  } catch (err) {
    console.error('Cron timeout-check error:', err);
    return res.status(500).json({ error: 'Internal server error in cron job' });
  }
}
