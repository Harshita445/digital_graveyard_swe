/**
 * Seeds the graveyard with REAL abandoned projects ("open graves").
 *
 * It searches GitHub for repositories that are archived (or untouched for years)
 * AND carry an open-source license (MIT/Apache/BSD...). Those licenses already
 * allow anyone to fork and modify the code, so no owner permission is needed.
 * Each repo is analyzed from its real GitHub history to build the autopsy.
 *
 * Additive only: existing projects are never deleted; repos already in the
 * database are refreshed instead of duplicated.
 *
 * Usage:
 *   GITHUB_TOKEN=$(gh auth token) node scripts/seed-open-graves.mjs [perQuery=5]
 *   node scripts/seed-open-graves.mjs --dry-run   # list what would be added, no DB writes
 */
import { PrismaClient } from '@prisma/client';
import { analyzeGitHubRepository, githubRest, isOpenLicense } from '../lib/githubIntelligence.js';

const DRY_RUN = process.argv.includes('--dry-run');
const PER_QUERY = Number(process.argv.find(arg => /^\d+$/.test(arg)) || 5);

if (!process.env.GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN is required. Run:  GITHUB_TOKEN=$(gh auth token) node scripts/seed-open-graves.mjs');
  process.exit(1);
}

// Diverse searches so the graveyard is not all JavaScript.
const QUERIES = [
  { q: 'archived:true license:mit stars:>500 pushed:<2023-01-01 language:JavaScript', category: 'Web' },
  { q: 'archived:true license:mit stars:>300 pushed:<2023-01-01 language:TypeScript', category: 'Web' },
  { q: 'archived:true stars:>300 pushed:<2023-01-01 language:Python topic:machine-learning', category: 'AI/ML' },
  { q: 'archived:true license:apache-2.0 stars:>300 pushed:<2023-01-01 language:Go', category: 'DevTools' },
  { q: 'archived:true license:mit stars:>200 pushed:<2023-01-01 language:Swift', category: 'Mobile' },
  { q: 'archived:true license:mit stars:>200 pushed:<2023-01-01 language:Kotlin', category: 'Mobile' },
  { q: 'archived:true stars:>200 pushed:<2023-01-01 topic:iot', category: 'IoT' },
  { q: 'archived:true stars:>200 pushed:<2023-01-01 topic:game', category: 'Game' },
  { q: 'archived:true stars:>100 pushed:<2023-01-01 topic:education', category: 'Education' },
  { q: 'archived:true stars:>200 pushed:<2023-01-01 topic:security', category: 'Security' },
  { q: 'archived:true stars:>200 pushed:<2023-01-01 topic:ethereum', category: 'Web3' }
];

const CURATOR = {
  email: 'curator@digital-graveyard.local',
  alias: 'Curator-0000'
};

async function searchRepos(query) {
  const params = new URLSearchParams({ q: query, sort: 'stars', order: 'desc', per_page: String(PER_QUERY * 2) });
  const result = await githubRest(`/search/repositories?${params}`);
  return (result?.items || [])
    .filter(repo => isOpenLicense(repo.license?.spdx_id))
    .filter(repo => !repo.fork)
    .slice(0, PER_QUERY);
}

function describe(repo) {
  const base = repo.description?.trim() || `${repo.name} — an abandoned ${repo.language || ''} project.`;
  const years = Math.max(1, Math.round((Date.now() - new Date(repo.pushed_at)) / (365 * 86400000)));
  return `${base}\n\nOriginally built by @${repo.owner.login}. ${repo.archived ? 'Archived by its owner' : 'Untouched'} for about ${years} year${years === 1 ? '' : 's'}. Licensed ${repo.license.spdx_id}, so anyone may fork and revive it with attribution.`;
}

function tagsFor(repo) {
  const tags = [repo.language, ...(repo.topics || [])].filter(Boolean);
  return JSON.stringify([...new Set(tags)].slice(0, 5));
}

async function main() {
  const prisma = DRY_RUN ? null : new PrismaClient();

  let curator = null;
  if (!DRY_RUN) {
    curator = await prisma.user.upsert({
      where: { email: CURATOR.email },
      update: {},
      create: { email: CURATOR.email, alias: CURATOR.alias, credits: 0, reputation: 100 }
    });
  }

  const seen = new Set();
  let added = 0;
  let refreshed = 0;

  for (const { q, category } of QUERIES) {
    let repos = [];
    try {
      repos = await searchRepos(q);
    } catch (err) {
      console.warn(`Search failed (${q}): ${err.message}`);
      continue;
    }

    for (const repo of repos) {
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      const url = `https://github.com/${repo.full_name}`;

      if (DRY_RUN) {
        console.log(`[dry-run] ${category.padEnd(9)} ${repo.full_name} (${repo.stargazers_count}★, ${repo.license.spdx_id}, last push ${repo.pushed_at.slice(0, 10)})`);
        continue;
      }

      process.stdout.write(`Analyzing ${repo.full_name} ... `);
      let intelligence;
      try {
        intelligence = await analyzeGitHubRepository(url);
      } catch (err) {
        console.log(`skipped (${err.message})`);
        continue;
      }

      const existing = await prisma.project.findFirst({ where: { githubRepoUrl: url } });
      if (existing) {
        await prisma.project.update({ where: { id: existing.id }, data: intelligence });
        refreshed += 1;
        console.log('refreshed');
        continue;
      }

      await prisma.project.create({
        data: {
          ownerId: curator.id,
          title: repo.name,
          description: describe(repo),
          fileUrl: url,
          fileName: `${repo.full_name} (${repo.default_branch})`,
          stakeRequired: 0,
          techTags: tagsFor(repo),
          category,
          completion: 0,
          status: 'LISTED',
          source: 'OPEN_GRAVE',
          ...intelligence
        }
      });
      added += 1;
      console.log(`added (score ${intelligence.revivalScore}, ${intelligence.autopsyCause})`);
    }
  }

  console.log(DRY_RUN ? `\n${seen.size} repos would be added.` : `\nDone: ${added} added, ${refreshed} refreshed.`);
  if (prisma) await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
