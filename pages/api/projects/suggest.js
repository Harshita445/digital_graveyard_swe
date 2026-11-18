import prisma from '../../../lib/prisma';
import { parseSession } from '../../../lib/auth';
import { analyzeGitHubRepository, parseGitHubRepositoryUrl, githubRest } from '../../../lib/githubIntelligence';
import { classifyRepoForListing, guessCategory } from '../../../lib/listing';

// GitHub analysis can take several seconds on big repos.
export const config = { maxDuration: 60 };

const DAILY_LIMIT = 10;

/**
 * POST /api/projects/suggest  { repoUrl }
 * One-field nomination: anyone signed in pastes a GitHub URL. If the repo is abandoned and its
 * license already allows forking, it is listed as an open grave straight away, with its title,
 * description, category and tags taken from GitHub and an autopsy run immediately.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = parseSession(req);
    if (!userId) return res.status(401).json({ error: 'Sign in to suggest a repository.' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.banned) return res.status(403).json({ error: 'Your account is restricted due to ghost strikes (3+ strikes).' });

    const recent = await prisma.project.count({
      where: { ownerId: userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    });
    if (recent >= DAILY_LIMIT) {
      return res.status(429).json({ error: `You can suggest up to ${DAILY_LIMIT} repositories a day. Try again tomorrow.` });
    }

    const parsed = parseGitHubRepositoryUrl(String(req.body?.repoUrl || '').trim());
    if (!parsed) return res.status(400).json({ error: 'Paste a GitHub repository URL, like https://github.com/owner/repo' });

    const duplicate = await prisma.project.findFirst({ where: { githubRepoUrl: parsed.url } });
    if (duplicate) {
      return res.status(409).json({ error: 'That repository is already in the graveyard.', projectId: duplicate.id });
    }

    const repo = await githubRest(`/repos/${parsed.owner}/${parsed.name}`).catch(() => null);
    if (!repo || repo.private) return res.status(404).json({ error: 'Could not find that repository on GitHub. Is it public?' });
    if (repo.fork) {
      return res.status(400).json({ error: `${repo.full_name} is itself a fork. Suggest the original (${repo.parent?.full_name || 'its parent'}) instead.` });
    }

    const verdict = classifyRepoForListing(repo, user.githubUsername);
    if (!verdict.ok) {
      return res.status(403).json({ error: `${repo.full_name} can't be listed: ${verdict.reasons.join('; ')}.`, checks: verdict });
    }
    if (verdict.source === 'DONATED') {
      return res.status(400).json({ error: 'This is your own repository. Use the full form below to donate it, so you can add a handoff letter.' });
    }

    const tags = [repo.language, ...(repo.topics || [])].filter(Boolean).slice(0, 8);
    let project = await prisma.project.create({
      data: {
        ownerId: userId,
        title: repo.name,
        description: repo.description?.trim() || `${repo.name}: an abandoned ${repo.language || 'open-source'} project by ${repo.owner.login}.`,
        stakeRequired: 0,
        techTags: JSON.stringify(tags),
        category: guessCategory(repo),
        source: 'OPEN_GRAVE',
        completion: 0,
        milestoneMode: false,
        githubRepoUrl: parsed.url,
        status: 'LISTED'
      }
    });

    try {
      const intelligence = await analyzeGitHubRepository(parsed.url);
      project = await prisma.project.update({ where: { id: project.id }, data: intelligence });
    } catch (analysisError) {
      console.warn('Suggested repo analysis skipped:', analysisError.message);
    }

    return res.status(201).json({
      project,
      message: `${repo.full_name} is now an open grave: ${repo.archived ? 'archived' : 'inactive for 12+ months'}, and its ${repo.license?.spdx_id} license allows anyone to fork it.`
    });
  } catch (err) {
    console.error('Suggest repo error:', err);
    return res.status(500).json({ error: 'Something went wrong while checking that repository.' });
  }
}
