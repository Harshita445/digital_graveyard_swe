import prisma from '../../../lib/prisma';
import { parseSession } from '../../../lib/auth';
import { enrichProject } from '../../../lib/mockFallback';
import { analyzeGitHubRepository, parseGitHubRepositoryUrl, githubRest } from '../../../lib/githubIntelligence';
import { classifyRepoForListing, validateListingDetails } from '../../../lib/listing';
import { PLEDGE } from '../../../lib/claimRules';

export const config = { maxDuration: 60 };
const LISTINGS_PER_DAY = 10;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { search, category, tech, status } = req.query;

      const where = {};

      if (category && category !== 'Any') {
        where.category = category;
      }

      if (status && status !== 'Any') {
        where.status = status;
      }

      if (req.query.source && req.query.source !== 'Any') {
        where.source = req.query.source;
      }

      const projects = await prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: { id: true, alias: true, reputation: true, ghostStrikes: true }
          },
          commitments: {
            where: {
              status: { in: ['PENDING_APPROVAL', 'ACTIVE', 'SUBMITTED'] }
            },
            select: {
              id: true,
              status: true,
              taker: {
                select: { id: true, alias: true, reputation: true }
              },
              stakeLocked: true,
              ghostDeadlineAt: true
            }
          }
        }
      });

      // Filter in-memory for search query and tech tags
      let filtered = projects;
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(p =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.techTags.toLowerCase().includes(q)
        );
      }

      if (tech && tech !== 'Any') {
        filtered = filtered.filter(p =>
          p.techTags.toLowerCase().includes(tech.toLowerCase())
        );
      }

      return res.status(200).json({ projects: filtered.map((p, idx) => enrichProject(p, idx)) });
    } catch (err) {
      console.error('Error listing projects:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const userId = parseSession(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(401).json({ error: 'User not found' });

      // Same daily limit as the quick suggest box (both count every listing you made today).
      const recent = await prisma.project.count({
        where: { ownerId: userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      });
      if (recent >= LISTINGS_PER_DAY) {
        return res.status(429).json({ error: `You can list up to ${LISTINGS_PER_DAY} repositories a day. Try again tomorrow.` });
      }

      // Every listing needs a public GitHub repo: commits on forks of it are how claims are checked.
      const githubRepoUrl = String(req.body?.githubRepoUrl || '').trim();
      const parsedRepo = parseGitHubRepositoryUrl(githubRepoUrl);
      if (!parsedRepo) {
        return res.status(400).json({ error: 'A GitHub repository URL is required, like https://github.com/owner/repository' });
      }

      // Check the form before spending any GitHub calls on it.
      const details = validateListingDetails(req.body, 'DONATED');
      if (details.error) return res.status(400).json({ error: details.error });

      const duplicate = await prisma.project.findFirst({ where: { githubRepoUrl: parsedRepo.url } });
      if (duplicate) {
        return res.status(409).json({ error: 'This repository is already in the graveyard.', projectId: duplicate.id });
      }

      const repo = await githubRest(`/repos/${parsedRepo.owner}/${parsedRepo.name}`).catch(() => null);
      if (!repo || repo.private) {
        return res.status(400).json({ error: 'Could not find that repository on GitHub. Is it public?' });
      }
      // Owning a fork doesn't make you the owner of the code inside it.
      if (repo.fork) {
        return res.status(400).json({ error: `${repo.full_name} is a fork. List the original (${repo.parent?.full_name || 'its parent'}) instead.` });
      }

      // Permission check: the platform only lists code it is allowed to list.
      //  1. you own the repo (your GitHub login is the repo owner)          -> DONATED
      //  2. or it is abandoned AND its license already allows forking      -> OPEN_GRAVE
      const verdict = classifyRepoForListing(repo, user.githubUsername);
      if (!verdict.ok) {
        const reasons = [...verdict.reasons];
        if (!user.githubUsername) reasons.push('if it is yours, connect your GitHub account to prove you own it');
        return res.status(403).json({
          error: `You can't list ${repo.full_name}: ${reasons.join('; ')}. You can list repos you own, or abandoned repos whose license allows forking.`
        });
      }
      const source = verdict.source;

      // Only the owner of a donated repo can offer to answer questions.
      details.data.ownerAvailable = source === 'DONATED' && details.data.ownerAvailable;

      let project = await prisma.project.create({
        data: {
          ...details.data,
          ownerId: userId,
          source,
          stakeRequired: PLEDGE,
          githubRepoUrl: parsedRepo.url,
          status: 'LISTED'
        }
      });

      if (process.env.GITHUB_TOKEN) {
        try {
          const intelligence = await analyzeGitHubRepository(githubRepoUrl);
          project = await prisma.project.update({ where: { id: project.id }, data: intelligence });
        } catch (analysisError) {
          console.warn('Initial GitHub repository analysis skipped:', analysisError.message);
        }
      }

      return res.status(201).json({
        project,
        message: source === 'OPEN_GRAVE'
          ? 'Nominated as an open grave: the repo is abandoned and its license allows anyone to fork it.'
          : 'Listed as a donated project from its verified owner.'
      });
    } catch (err) {
      console.error('Error creating project:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
