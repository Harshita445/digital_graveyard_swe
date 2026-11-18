import prisma from './prisma';

// Open graves are community projects: any number of people can revive one at the same time.
// These helpers keep the project's status in step with its revivers.

export const OPEN_GRAVE_CLAIM_DAYS = 14;

// LISTED while nobody is working on it, ACTIVE while someone is, COMPLETED once any fork
// has been verified (it stays COMPLETED: later revivers keep improving the living version).
export async function refreshOpenGraveStatus(projectId) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (!project || project.status === 'COMPLETED') return project?.status;
  const working = await prisma.commitment.count({ where: { projectId, status: 'ACTIVE' } });
  const status = working > 0 ? 'ACTIVE' : 'LISTED';
  if (status !== project.status) {
    await prisma.project.update({ where: { id: projectId }, data: { status } });
  }
  return status;
}

// Public list of everyone who joined the revival (aliases only, never GitHub identities).
export function reviversOf(commitments = []) {
  return commitments
    .filter(c => ['ACTIVE', 'COMPLETED'].includes(c.status))
    .sort((a, b) => new Date(a.committedAt) - new Date(b.committedAt))
    .map(c => ({
      id: c.id,
      alias: c.taker?.alias || 'Digger',
      status: c.status,
      joinedAt: c.committedAt,
      verifiedAt: c.status === 'COMPLETED' ? c.resolvedAt : null,
      forkUrl: c.status === 'COMPLETED' ? c.submissionUrl : null
    }));
}
