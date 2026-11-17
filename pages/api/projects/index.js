import prisma from '../../../lib/prisma';
import { parseSession } from '../../../lib/auth';
import { enrichProject } from '../../../lib/mockFallback';
import { analyzeGitHubRepository, parseGitHubRepositoryUrl, githubRest, isOpenLicense } from '../../../lib/githubIntelligence';

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
      if (user.banned) {
        return res.status(403).json({ error: 'Your account is restricted due to ghost strikes (3+ strikes).' });
      }

      const {
        title,
        description,
        stakeRequired = 100,
        techTags = '[]',
        category = 'Web',
        completion = 20,
        milestoneMode = false,
        fileName = 'project_archive.zip',
        fileUrl = '/downloads/source.zip',
        milestones = [],
        githubRepoUrl = ''
      } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: 'Title and description are required' });
      }

      const parsedRepo = githubRepoUrl ? parseGitHubRepositoryUrl(githubRepoUrl) : null;
      if (githubRepoUrl && !parsedRepo) {
        return res.status(400).json({ error: 'GitHub repository URL must look like https://github.com/owner/repository' });
      }

      // Permission check — the platform only lists code it is allowed to list:
      //  1. you own the repo (your GitHub login is the repo owner)  -> DONATED
      //  2. or the repo is abandoned AND its license already allows forking -> OPEN_GRAVE
      let source = 'DONATED';
      if (parsedRepo) {
        const duplicate = await prisma.project.findFirst({ where: { githubRepoUrl: parsedRepo.url } });
        if (duplicate) {
          return res.status(409).json({ error: 'This repository is already in the graveyard.', projectId: duplicate.id });
        }

        const repo = await githubRest(`/repos/${parsedRepo.owner}/${parsedRepo.name}`).catch(() => null);
        if (!repo) {
          return res.status(400).json({ error: 'Could not find that repository on GitHub. Is it public?' });
        }
        const isOwner = user.githubUsername && repo.owner?.login?.toLowerCase() === user.githubUsername.toLowerCase();
        const monthsInactive = (Date.now() - new Date(repo.pushed_at).getTime()) / (30 * 86400000);
        const abandoned = repo.archived || monthsInactive >= 12;
        const openLicense = isOpenLicense(repo.license?.spdx_id);

        if (isOwner) {
          source = 'DONATED';
        } else if (abandoned && openLicense) {
          source = 'OPEN_GRAVE';
        } else {
          const reasons = [];
          if (!user.githubUsername) reasons.push('connect your GitHub account to prove you own it');
          if (!openLicense) reasons.push(`it has no open-source license (${repo.license?.spdx_id || 'none'}), so only its owner can list it`);
          else if (!abandoned) reasons.push('it is still actively maintained');
          return res.status(403).json({
            error: `You can't list ${repo.full_name}: ${reasons.join('; ')}. You can list repos you own, or abandoned repos whose license allows forking.`
          });
        }
      }

      const normalizedCategory = category === 'Cybersecurity' ? 'Security' : category;

      let project = await prisma.project.create({
        data: {
          ownerId: userId,
          title,
          description,
          stakeRequired: source === 'OPEN_GRAVE' ? 0 : Number(stakeRequired),
          techTags: typeof techTags === 'string' ? techTags : JSON.stringify(techTags),
          category: normalizedCategory,
          source,
          handoffNote: req.body.handoffNote ? String(req.body.handoffNote).slice(0, 4000) : null,
          completion: Number(completion),
          milestoneMode: Boolean(milestoneMode),
          fileName,
          fileUrl,
          githubRepoUrl: parsedRepo ? parsedRepo.url : null,
          status: 'LISTED'
        }
      });

      if (githubRepoUrl && process.env.GITHUB_TOKEN) {
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
