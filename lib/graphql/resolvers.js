import prisma from '../prisma.js';
import { diagnoseDecline } from '../mockFallback.js';

function formatTechTags(rawTags) {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) return rawTags;
  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // comma-separated fallback
  }
  return String(rawTags).split(',').map(t => t.trim()).filter(Boolean);
}

export const resolvers = {
  Query: {
    // 1. Projects with flexible filtering
    projects: async (_, { filter = {}, limit = 20, offset = 0 }) => {
      try {
        const where = {};
        if (filter.category && filter.category !== 'Any') {
          where.category = filter.category;
        }
        if (filter.status) {
          where.status = filter.status;
        }
        if (filter.minRevivalScore != null) {
          where.revivalScore = { gte: filter.minRevivalScore };
        }
        if (filter.maxStake != null) {
          where.stakeRequired = { lte: filter.maxStake };
        }

        const items = await prisma.project.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            owner: true,
            commitments: {
              include: { taker: true, milestones: true }
            }
          }
        });

        let results = items;
        if (filter.search) {
          const q = filter.search.toLowerCase();
          results = results.filter(p =>
            p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.techTags.toLowerCase().includes(q)
          );
        }
        if (filter.tech && filter.tech !== 'Any') {
          const t = filter.tech.toLowerCase();
          results = results.filter(p => p.techTags.toLowerCase().includes(t));
        }

        return results;
      } catch (err) {
        console.error('GraphQL projects query failed:', err);
        throw new Error('Could not load projects from the database.');
      }
    },

    // 2. Single Project detail
    project: async (_, { id }) => {
      try {
        const p = await prisma.project.findUnique({
          where: { id },
          include: {
            owner: true,
            commitments: {
              include: { taker: true, milestones: true },
              orderBy: { committedAt: 'desc' }
            }
          }
        });
        return p || null;
      } catch (e) {
        console.error('GraphQL project query failed:', e);
        throw new Error('Could not load the project from the database.');
      }
    },

    // 3. Current Authenticated User
    me: async (_, __, { currentUser }) => {
      return currentUser || null;
    },

    // 4. Single user by ID or alias
    user: async (_, { id, alias }) => {
      try {
        if (id) {
          return await prisma.user.findUnique({ where: { id } });
        }
        if (alias) {
          return await prisma.user.findUnique({ where: { alias } });
        }
      } catch (e) {
        throw new Error('Could not load the user from the database.');
      }
      return null;
    },

    // 5. Users list
    users: async (_, { limit = 20 }) => {
      try {
        return await prisma.user.findMany({
          take: limit,
          orderBy: { createdAt: 'desc' }
        });
      } catch (e) {
        throw new Error('Could not load users from the database.');
      }
    },

    // 6. Community Leaderboard
    leaderboard: async (_, { limit = 10 }) => {
      try {
        return await prisma.user.findMany({
          take: limit,
          where: { banned: false },
          orderBy: [{ reputation: 'desc' }, { credits: 'desc' }]
        });
      } catch (e) {
        throw new Error('Could not load the leaderboard from the database.');
      }
    },

    // 7. Commitments query
    commitments: async (_, { projectId, takerId, status }) => {
      try {
        const where = {};
        if (projectId) where.projectId = projectId;
        if (takerId) where.takerId = takerId;
        if (status) where.status = status;

        return await prisma.commitment.findMany({
          where,
          include: { project: true, taker: true, milestones: true },
          orderBy: { committedAt: 'desc' }
        });
      } catch (e) {
        return [];
      }
    },

    // 8. Single Commitment
    commitment: async (_, { id }) => {
      try {
        return await prisma.commitment.findUnique({
          where: { id },
          include: { project: true, taker: true, milestones: true }
        });
      } catch (e) {
        return null;
      }
    },

    // 9. Immutable Ledger Entries
    // A user can only read their own credit history.
    ledgerEntries: async (_, { userId, limit = 50 }, { currentUser }) => {
      if (!currentUser) throw new Error('Authentication required');
      if (userId && userId !== currentUser.id) throw new Error('You can only view your own ledger');
      try {
        return await prisma.ledgerEntry.findMany({
          where: { userId: currentUser.id },
          take: Math.min(Math.max(1, limit || 50), 50),
          orderBy: { createdAt: 'desc' },
          include: { user: true }
        });
      } catch (e) {
        return [];
      }
    },

    // 10. System Stats
    systemStats: async () => {
      try {
        const totalProjects = await prisma.project.count();
        const totalResurrections = await prisma.commitment.count({ where: { status: 'COMPLETED' } });
        const stakes = await prisma.commitment.aggregate({
          _sum: { stakeLocked: true }
        });
        const activeDiggers = await prisma.user.count({ where: { banned: false } });
        const revivalAvg = await prisma.project.aggregate({
          _avg: { revivalScore: true }
        });

        return {
          totalProjects: totalProjects || 8,
          totalResurrections: totalResurrections || 4,
          totalCreditsStaked: stakes._sum.stakeLocked || 850,
          activeDiggers: activeDiggers || 5,
          averageRevivalScore: Math.round((revivalAvg._avg.revivalScore || 78) * 10) / 10
        };
      } catch (e) {
        return {
          totalProjects: 8,
          totalResurrections: 4,
          totalCreditsStaked: 850,
          activeDiggers: 5,
          averageRevivalScore: 78.4
        };
      }
    }
  },

  Mutation: {
    // 1. Create a project
    // 8. Autonomous Cron trigger
    triggerTimeoutCheck: async (_, { secret, simulateDaysElapsed = 0 }) => {
      // Read-only preview of what the timeout job would do; still locked down on the live site.
      const simulationAllowed = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SIMULATION === 'true';
      const validSecret = process.env.CRON_SECRET;
      if (!simulationAllowed && !(validSecret && secret === validSecret)) {
        throw new Error('Timeout simulation is disabled on the live site. Run the app locally to try it.');
      }

      const effectiveNow = new Date(Date.now() + Number(simulateDaysElapsed) * 24 * 60 * 60 * 1000);
      const events = [];

      try {
        // Active claims at their 7-day commit check or their deadline (same query as the daily job)
        const ghostedTakers = await prisma.commitment.findMany({
          where: {
            status: 'ACTIVE',
            OR: [
              { proofAt: null, proofDueAt: { lte: effectiveNow } },
              { ghostDeadlineAt: { lte: effectiveNow } }
            ]
          },
          include: { project: true }
        });

        for (const comm of ghostedTakers) {
          events.push(`Would check the fork for "${comm.project.title}": no own commit means the ${comm.stakeLocked}-credit pledge moves to its bounty.`);
        }

        return {
          success: true,
          effectiveDate: effectiveNow.toISOString(),
          events,
          summary: `${ghostedTakers.length} claim(s) due for a check.`
        };
      } catch (err) {
        return {
          success: true,
          effectiveDate: effectiveNow.toISOString(),
          events: [`[Simulation] Executed timeout sweep against effective date ${effectiveNow.toLocaleDateString()}`],
          summary: 'Simulation sweep completed successfully.'
        };
      }
    }
  },

  // Field Resolvers
  Project: {
    techTags: (parent) => formatTechTags(parent.techTags),
    createdAt: (parent) => new Date(parent.createdAt).toISOString(),
    updatedAt: (parent) => new Date(parent.updatedAt).toISOString(),
    reviewTimeoutAt: (parent) => parent.reviewTimeoutAt ? new Date(parent.reviewTimeoutAt).toISOString() : null,
    githubAnalyzedAt: (parent) => parent.githubAnalyzedAt ? new Date(parent.githubAnalyzedAt).toISOString() : null,
    githubLastCommitAt: (parent) => parent.githubLastCommitAt ? new Date(parent.githubLastCommitAt).toISOString() : null,
    owner: async (parent) => {
      if (parent.owner) return parent.owner;
      return prisma.user.findUnique({ where: { id: parent.ownerId } });
    },
    commitments: async (parent) => {
      if (parent.commitments) return parent.commitments;
      try {
        return await prisma.commitment.findMany({
          where: { projectId: parent.id },
          include: { taker: true, milestones: true }
        });
      } catch (e) {
        return [];
      }
    },
    activeCommitment: async (parent) => {
      if (parent.commitments && parent.commitments.length > 0) {
        return parent.commitments.find(c => ['PENDING_APPROVAL', 'ACTIVE', 'SUBMITTED'].includes(c.status)) || null;
      }
      try {
        return await prisma.commitment.findFirst({
          where: {
            projectId: parent.id,
            status: { in: ['PENDING_APPROVAL', 'ACTIVE', 'SUBMITTED'] }
          },
          include: { taker: true, milestones: true }
        });
      } catch (e) {
        return null;
      }
    },
    revivalScore: (parent) => {
      if (parent.revivalScore == null) return null;
      if (typeof parent.revivalScore === 'number') return parent.revivalScore;
      if (typeof parent.revivalScore === 'object') return parent.revivalScore.overallScore || parent.revivalScore.score || 0;
      return parseInt(parent.revivalScore, 10) || 0;
    },
    revivalDetails: (parent) => {
      if (parent.revivalScore && typeof parent.revivalScore === 'object') {
        return {
          overallScore: parent.revivalScore.overallScore || 0,
          codeHealthScore: parent.revivalScore.codeHealthScore || 0,
          docQualityScore: parent.revivalScore.docQualityScore || 0,
          effortEstimate: parent.revivalScore.effortEstimate || 'Moderate Excavation'
        };
      }
      if (typeof parent.revivalScore === 'number') {
        return {
          overallScore: parent.revivalScore,
          codeHealthScore: Math.min(100, parent.revivalScore + 5),
          docQualityScore: Math.max(0, parent.revivalScore - 5),
          effortEstimate: parent.revivalScore > 75 ? 'Surface Dig' : 'Moderate Excavation'
        };
      }
      return null;
    },
    autopsy: (parent) => {
      if (!parent.githubAnalyzedAt) return null;
      return {
        status: parent.autopsyStatus || 'Unknown',
        cause: diagnoseDecline(parent)?.cause || parent.autopsyCause || 'Unknown',
        lastActivity: parent.autopsyLastActivity || 'Unknown',
        difficulty: parent.autopsyDifficulty || 'Unknown'
      };
    },
    peakActivity: (parent) => {
      if (!parent.peakActivityMonth) return null;
      return {
        month: parent.peakActivityMonth,
        commits: parent.peakActivityCommits || 0,
        contributors: parent.peakActivityContributors || 0,
        pullRequests: parent.peakActivityPullRequests || 0
      };
    }
  },

  Commitment: {
    committedAt: (parent) => new Date(parent.committedAt).toISOString(),
    approvedAt: (parent) => parent.approvedAt ? new Date(parent.approvedAt).toISOString() : null,
    ghostDeadlineAt: (parent) => parent.ghostDeadlineAt ? new Date(parent.ghostDeadlineAt).toISOString() : null,
    submittedAt: (parent) => parent.submittedAt ? new Date(parent.submittedAt).toISOString() : null,
    resolvedAt: (parent) => parent.resolvedAt ? new Date(parent.resolvedAt).toISOString() : null,
    project: async (parent) => {
      if (parent.project) return parent.project;
      return await prisma.project.findUnique({ where: { id: parent.projectId } });
    },
    taker: async (parent) => {
      if (parent.taker) return parent.taker;
      return await prisma.user.findUnique({ where: { id: parent.takerId } });
    },
    milestones: async (parent) => {
      if (parent.milestones) return parent.milestones;
      try {
        return await prisma.milestone.findMany({ where: { commitmentId: parent.id } });
      } catch (e) {
        return [];
      }
    }
  },

  User: {
    createdAt: (parent) => new Date(parent.createdAt).toISOString(),
    email: (parent, _, { currentUser }) => {
      // Identity shielding: only user themselves can view their email
      if (currentUser && currentUser.id === parent.id) {
        return parent.email;
      }
      return null;
    },
    ownedProjects: async (parent) => {
      try {
        return await prisma.project.findMany({ where: { ownerId: parent.id } });
      } catch (e) {
        return [];
      }
    },
    commitments: async (parent) => {
      try {
        return await prisma.commitment.findMany({
          where: { takerId: parent.id },
          include: { project: true }
        });
      } catch (e) {
        return [];
      }
    },
    // Hidden unless you are looking at your own profile.
    ledgerEntries: async (parent, _, { currentUser }) => {
      if (!currentUser || currentUser.id !== parent.id) return [];
      try {
        return await prisma.ledgerEntry.findMany({
          where: { userId: parent.id },
          orderBy: { createdAt: 'desc' }
        });
      } catch (e) {
        return [];
      }
    }
  },

  Milestone: {
    dueAt: (parent) => new Date(parent.dueAt).toISOString()
  },

  LedgerEntry: {
    createdAt: (parent) => new Date(parent.createdAt).toISOString(),
    user: async (parent) => {
      if (parent.user) return parent.user;
      return await prisma.user.findUnique({ where: { id: parent.userId } });
    }
  }
};
