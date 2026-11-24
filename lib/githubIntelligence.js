import { URL } from 'url';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

const REPOSITORY_QUERY = `
  query RepositoryIntelligence($owner: String!, $name: String!, $commitCursor: String) {
    repository(owner: $owner, name: $name) {
      name
      description
      owner { login }
      createdAt
      updatedAt
      isArchived
      defaultBranchRef {
        name
        target {
          ... on Commit {
            history(first: 100, after: $commitCursor) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes { committedDate author { user { login } } }
            }
          }
        }
      }
      licenseInfo { name spdxId }
      stargazerCount
      forkCount
      watchers { totalCount }
      issues(first: 1, states: OPEN) { totalCount }
      closedIssues: issues(first: 1, states: CLOSED) { totalCount }
      pullRequests(first: 1, states: [OPEN, CLOSED, MERGED]) { totalCount }
      releases(first: 1) { totalCount }
      readme: object(expression: "HEAD:README.md") {
        ... on Blob { text }
      }
      pullRequestNodes: pullRequests(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes { createdAt }
      }
    }
  }
`;

export function parseGitHubRepositoryUrl(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    const url = new URL(value.trim());
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const name = parts[1].replace(/\.git$/, '');
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return null;
    return { owner, name, url: `https://github.com/${owner}/${name}` };
  } catch {
    return null;
  }
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function daysSince(value, now = new Date()) {
  return Math.max(0, (now.getTime() - value.getTime()) / 86400000);
}

function formatElapsedDays(days) {
  if (days < 45) return `${Math.max(1, Math.round(days))} days`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30))} months`;
  return `${Math.max(1, Math.round(days / 365))} years`;
}

// Log scale so 50 vs 500 vs 50,000 stars still differ instead of all maxing out.
const logScale = (value, max) => Math.min(1, Math.log10(1 + Math.max(0, value)) / Math.log10(1 + max));

// "How revivable is this?" — each factor is 0..1, weights sum to 100.
export const SCORE_WEIGHTS = { documentation: 20, freshness: 25, community: 20, adoption: 15, maintenance: 20 };

function calculateScore({ repository, readmeLength, commits, contributors }) {
  const lastCommit = commits.reduce((latest, commit) => {
    const date = new Date(commit.committedDate);
    return date > latest ? date : latest;
  }, new Date(0));
  const yearsDead = daysSince(lastCommit.getTime() > 0 ? lastCommit : new Date(repository.updatedAt)) / 365;

  // A README is the map for whoever revives it.
  const documentation = Math.min(1, readmeLength / 4000);
  // Recently-dead code is far easier to revive: dependencies still resolve, tools still run.
  const freshness = Math.max(0, 1 - yearsDead / 8);
  // People who once knew the code (contributors seen in the sampled history) and PR culture.
  const community = logScale(contributors, 100) * 0.7 + logScale(repository.pullRequests.totalCount, 2000) * 0.3;
  // Proof that people wanted it.
  const adoption = logScale(repository.stargazerCount, 50000) * 0.7 + logScale(repository.forkCount, 10000) * 0.3;
  // A huge unanswered issue pile means more archaeology before any new work.
  const issueTotal = repository.issues.totalCount + repository.closedIssues.totalCount;
  const maintenance = issueTotal === 0 ? 0.6 : repository.closedIssues.totalCount / issueTotal;

  const w = SCORE_WEIGHTS;
  return Math.max(0, Math.min(100, Math.round(
    documentation * w.documentation + freshness * w.freshness + community * w.community +
    adoption * w.adoption + maintenance * w.maintenance
  )));
}

function buildAnalysis(repository, readmeText) {
  const commits = repository.defaultBranchRef?.target?.history?.nodes || [];
  const commitDates = commits.map(commit => new Date(commit.committedDate)).filter(date => !Number.isNaN(date.getTime()));
  const lastCommitAt = commitDates.length > 0 ? new Date(Math.max(...commitDates.map(date => date.getTime()))) : null;
  const contributorLogins = new Set(commits.map(commit => commit.author?.user?.login).filter(Boolean));
  const pullRequestDates = (repository.pullRequestNodes?.nodes || [])
    .map(pullRequest => new Date(pullRequest.createdAt))
    .filter(date => !Number.isNaN(date.getTime()));
  const activityByMonth = {};

  commits.forEach(commit => {
    const date = new Date(commit.committedDate);
    if (Number.isNaN(date.getTime())) return;
    const key = monthKey(date);
    activityByMonth[key] ||= { commits: 0, contributors: new Set(), pullRequests: 0 };
    activityByMonth[key].commits += 1;
    if (commit.author?.user?.login) activityByMonth[key].contributors.add(commit.author.user.login);
  });

  pullRequestDates.forEach(date => {
    const key = monthKey(date);
    activityByMonth[key] ||= { commits: 0, contributors: new Set(), pullRequests: 0 };
    activityByMonth[key].pullRequests += 1;
  });

  const peak = Object.entries(activityByMonth).sort(([, first], [, second]) => {
    return (second.commits + second.pullRequests) - (first.commits + first.pullRequests);
  })[0];
  const peakActivity = peak ? {
    month: peak[0],
    commits: peak[1].commits,
    contributors: peak[1].contributors.size,
    pullRequests: peak[1].pullRequests
  } : { month: null, commits: 0, contributors: 0, pullRequests: 0 };

  const lastActivity = lastCommitAt || new Date(repository.updatedAt);
  const inactivityDays = daysSince(lastActivity);
  const status = repository.isArchived || inactivityDays > 730 ? 'Abandoned' : inactivityDays > 180 ? 'Dormant' : 'Healthy';
  const cause = status === 'Healthy'
    ? 'Unknown'
    : contributorLogins.size <= 1
      ? 'Maintainer Attrition'
      : readmeText.length < 300
        ? 'Documentation Debt'
        : inactivityDays > 365
          ? 'Stalled Development'
          : repository.stargazerCount < 10
            ? 'Low Community Adoption'
            : 'Incomplete MVP';
  const score = calculateScore({ repository, readmeLength: readmeText.length, commits, contributors: contributorLogins.size });

  return {
    githubRepoOwner: repository.owner.login,
    githubRepoName: repository.name,
    githubDescription: repository.description || '',
    githubCreatedAt: new Date(repository.createdAt),
    githubLastUpdatedAt: new Date(repository.updatedAt),
    githubDefaultBranch: repository.defaultBranchRef?.name || null,
    githubLicense: repository.licenseInfo?.spdxId || repository.licenseInfo?.name || null,
    githubTotalCommits: repository.defaultBranchRef?.target?.history?.totalCount || 0,
    githubCommitFrequency: commitDates.length > 1 ? Number((commitDates.length / Math.max(1, (Math.max(...commitDates.map(date => date.getTime())) - Math.min(...commitDates.map(date => date.getTime()))) / 604800000)).toFixed(2)) : 0,
    githubLastCommitAt: lastCommitAt,
    githubContributors: contributorLogins.size,
    githubOpenIssues: repository.issues.totalCount,
    githubClosedIssues: repository.closedIssues.totalCount,
    githubPullRequests: repository.pullRequests.totalCount,
    githubReleases: repository.releases.totalCount,
    githubStars: repository.stargazerCount,
    githubForks: repository.forkCount,
    githubWatchers: repository.watchers.totalCount,
    githubReadmeExists: Boolean(readmeText),
    githubReadmeLength: readmeText.length,
    revivalScore: score,
    autopsyStatus: status,
    autopsyCause: cause,
    autopsyLastActivity: formatElapsedDays(inactivityDays),
    autopsyDifficulty: score >= 75 ? 'Easy' : score >= 50 ? 'Medium' : 'Hard',
    peakActivityMonth: peakActivity.month,
    peakActivityCommits: peakActivity.commits,
    peakActivityContributors: peakActivity.contributors,
    peakActivityPullRequests: peakActivity.pullRequests,
    githubAnalyzedAt: new Date()
  };
}

// Licenses that already allow anyone to fork, modify and redistribute the code.
const OPEN_LICENSES = new Set([
  'MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'ISC', 'Unlicense',
  'MPL-2.0', 'LGPL-2.1', 'LGPL-3.0', 'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'CC0-1.0', 'Zlib', 'BSL-1.0'
]);

export function isOpenLicense(spdxId) {
  return Boolean(spdxId) && OPEN_LICENSES.has(spdxId);
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Digital-Graveyard-Repository-Intelligence'
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export async function githubRest(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers: githubHeaders() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub API ${path} failed (${response.status})`);
  if (response.status === 202 || response.status === 204) return { pending: true };
  return response.json();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Whole-life activity from GitHub's contributor statistics (weekly commits per contributor).
// GitHub computes these lazily and answers 202 until ready, so retry a few times.
async function fetchLifetimeActivity(owner, name) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const stats = await githubRest(`/repos/${owner}/${name}/stats/contributors`);
    if (!stats) return null;
    if (stats.pending) { await sleep(2500); continue; }
    if (!Array.isArray(stats) || stats.length === 0) return null;

    const weeks = new Map(); // weekStart(ms) -> { commits, contributors:Set }
    let topMaintainer = null;
    for (const contributor of stats) {
      const login = contributor.author?.login || 'unknown';
      let lastSeen = null;
      for (const week of contributor.weeks || []) {
        if (!week.c) continue;
        const key = week.w * 1000;
        const entry = weeks.get(key) || { commits: 0, contributors: new Set() };
        entry.commits += week.c;
        entry.contributors.add(login);
        weeks.set(key, entry);
        lastSeen = key;
      }
      if (!topMaintainer || contributor.total > topMaintainer.total) {
        topMaintainer = { login, total: contributor.total, lastSeen };
      }
    }
    if (weeks.size === 0) return null;

    const times = [...weeks.keys()];
    const first = new Date(Math.min(...times));
    const last = new Date(Math.max(...times));
    const spanYears = (last - first) / (365 * 86400000);
    // Yearly buckets for long-lived repos, quarterly for short ones.
    const bucketOf = date => spanYears >= 3
      ? String(date.getUTCFullYear())
      : `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;

    const buckets = new Map();
    [...weeks.entries()].sort(([a], [b]) => a - b).forEach(([time, entry]) => {
      const key = bucketOf(new Date(time));
      const bucket = buckets.get(key) || { period: key, commits: 0, contributors: new Set() };
      bucket.commits += entry.commits;
      entry.contributors.forEach(login => bucket.contributors.add(login));
      buckets.set(key, bucket);
    });

    let timeline = [...buckets.values()].map(bucket => ({
      period: bucket.period,
      commits: bucket.commits,
      contributors: bucket.contributors.size
    }));
    if (timeline.length > 10) timeline = timeline.slice(-10);
    const peak = timeline.reduce((best, item) => (item.commits > best.commits ? item : best), timeline[0]);
    timeline = timeline.map(item => (item === peak ? { ...item, isPeak: true } : item));

    return {
      timeline,
      lastCommitAt: last,
      topMaintainer: topMaintainer?.login || null,
      maintainerLastSeen: topMaintainer?.lastSeen ? new Date(topMaintainer.lastSeen) : null
    };
  }
  return null;
}

/**
 * Checks that `forkUrl` is a real revival of `originalUrl`:
 * it must be a GitHub fork of the original and contain new commits pushed after `since`.
 * Git history is the proof of who did the work, so no manual review is needed.
 */
export async function verifyRevivalFork(originalUrl, forkUrl, since) {
  const original = parseGitHubRepositoryUrl(originalUrl);
  const fork = parseGitHubRepositoryUrl(forkUrl);
  if (!original) return { ok: false, reason: 'Original project has no GitHub repository.' };
  if (!fork) return { ok: false, reason: 'Submit the GitHub URL of your fork, e.g. https://github.com/you/repo' };

  const repo = await githubRest(`/repos/${fork.owner}/${fork.name}`);
  if (!repo) return { ok: false, reason: 'That repository does not exist or is private.' };
  const parentNames = [repo.parent?.full_name, repo.source?.full_name].filter(Boolean).map(n => n.toLowerCase());
  if (!repo.fork || !parentNames.includes(`${original.owner}/${original.name}`.toLowerCase())) {
    return { ok: false, reason: `That repository is not a fork of ${original.owner}/${original.name}.` };
  }

  const base = repo.parent?.default_branch || repo.default_branch;
  // A failed request throws (so callers can retry later) instead of looking like "no commits".
  const compare = await githubRest(
    `/repos/${original.owner}/${original.name}/compare/${encodeURIComponent(base)}...${fork.owner}:${encodeURIComponent(repo.default_branch)}`
  );
  const aheadBy = compare?.ahead_by ?? 0;
  const newCommits = (compare?.commits || []).filter(c => new Date(c.commit?.committer?.date || 0) > new Date(since));

  if (aheadBy === 0 || newCommits.length === 0) {
    return { ok: false, reason: 'Your fork has no new commits since you claimed this project yet.' };
  }

  // One entry per commit: the GitHub login when GitHub matched the commit email, else the git author name.
  const commitAuthors = newCommits.map(c => c.author?.login || c.commit?.author?.name || '');
  return {
    ok: true,
    forkUrl: fork.url,
    aheadBy,
    newCommits: newCommits.length,
    commitAuthors,
    authors: [...new Set(commitAuthors.filter(Boolean))]
  };
}

export async function analyzeGitHubRepository(repositoryUrl) {
  const parsed = parseGitHubRepositoryUrl(repositoryUrl);
  if (!parsed) throw new Error('A valid public GitHub repository URL is required');
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not configured');

  const requestPage = async (commitCursor = null) => {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Digital-Graveyard-Repository-Intelligence'
      },
      body: JSON.stringify({ query: REPOSITORY_QUERY, variables: { ...parsed, commitCursor } })
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) {
      throw new Error(payload.errors?.[0]?.message || `GitHub GraphQL request failed (${response.status})`);
    }
    if (!payload.data?.repository) throw new Error('GitHub repository was not found or is not accessible');
    return payload.data.repository;
  };

  const repository = await requestPage();
  const initialHistory = repository.defaultBranchRef?.target?.history;
  // Big repos have tens of thousands of commits; the latest 500 are enough for the
  // sampled metrics, and whole-life activity comes from contributor stats below.
  let pages = 1;
  while (initialHistory?.pageInfo?.hasNextPage && pages < 5) {
    const nextPage = await requestPage(initialHistory.pageInfo.endCursor);
    const nextHistory = nextPage.defaultBranchRef?.target?.history;
    initialHistory.nodes.push(...(nextHistory?.nodes || []));
    initialHistory.pageInfo = nextHistory?.pageInfo || { hasNextPage: false, endCursor: null };
    pages += 1;
  }

  const readmeText = repository.readme?.text || '';
  const analysis = buildAnalysis(repository, readmeText);
  const lifetime = await fetchLifetimeActivity(parsed.owner, parsed.name).catch(() => null);

  if (lifetime) {
    const peak = lifetime.timeline.find(item => item.isPeak);
    analysis.githubActivity = JSON.stringify(lifetime.timeline);
    analysis.githubTopMaintainer = lifetime.topMaintainer;
    analysis.githubMaintainerLastSeen = lifetime.maintainerLastSeen;
    if (peak) {
      analysis.peakActivityMonth = peak.period;
      analysis.peakActivityCommits = peak.commits;
      analysis.peakActivityContributors = peak.contributors;
      analysis.peakActivityPullRequests = null; // not measured over the whole lifetime
    }
    if (!analysis.githubLastCommitAt || lifetime.lastCommitAt > analysis.githubLastCommitAt) {
      analysis.githubLastCommitAt = lifetime.lastCommitAt;
    }
  }

  return { githubRepoUrl: parsed.url, githubArchived: Boolean(repository.isArchived), ...analysis };
}