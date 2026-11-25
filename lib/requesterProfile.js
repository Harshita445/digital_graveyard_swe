import prisma from './prisma.js';
import { githubRest } from './githubIntelligence.js';

/**
 * What the owner of a donated project sees about the person asking to take it over:
 * their GitHub profile and recent public work, plus their record on this platform.
 * Only ever returned to that project's owner, and only for the current request or claim.
 * GitHub data is best effort: if GitHub can't be reached, the platform record still shows.
 */
export async function requesterProfile(takerId) {
  const taker = await prisma.user.findUnique({
    where: { id: takerId },
    select: { id: true, alias: true, githubUsername: true, reputation: true, ghostStrikes: true, createdAt: true }
  });
  if (!taker) return null;

  const counts = await prisma.commitment.groupBy({
    by: ['status'],
    where: { takerId },
    _count: { _all: true }
  });
  const count = status => counts.find(c => c.status === status)?._count._all || 0;

  const profile = {
    alias: taker.alias,
    githubUsername: taker.githubUsername,
    githubUrl: taker.githubUsername ? `https://github.com/${taker.githubUsername}` : null,
    record: {
      reputation: taker.reputation,
      missedClaims: taker.ghostStrikes,
      revived: count('COMPLETED'),
      ghosted: count('GHOSTED'),
      quit: count('CANCELLED'),
      activeClaims: count('ACTIVE'),
      memberSince: taker.createdAt
    },
    github: null
  };

  if (!taker.githubUsername) return profile;
  try {
    const login = encodeURIComponent(taker.githubUsername);
    const [user, repos] = await Promise.all([
      githubRest(`/users/${login}`),
      githubRest(`/users/${login}/repos?sort=pushed&per_page=5&type=owner`)
    ]);
    if (user) {
      profile.github = {
        name: user.name || null,
        avatarUrl: user.avatar_url || null,
        bio: user.bio || null,
        joined: user.created_at,
        publicRepos: user.public_repos,
        followers: user.followers,
        recentRepos: (Array.isArray(repos) ? repos : []).filter(r => !r.fork).slice(0, 3).map(r => ({
          name: r.name,
          url: r.html_url,
          language: r.language,
          stars: r.stargazers_count,
          pushedAt: r.pushed_at
        }))
      };
    }
  } catch {
    // GitHub unreachable or rate limited: the owner still gets the link and the platform record.
  }
  return profile;
}
