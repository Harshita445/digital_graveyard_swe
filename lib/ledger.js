import prisma from './prisma.js';

/**
 * Appends an entry to the append-only ledger and applies it to the cached balances on User.
 *
 * Balances change with atomic increments (never read-then-write), so two requests at the same
 * moment can't both act on a stale balance. Debits that must not overdraw (the claim pledge)
 * are done in claimProject() in lib/claims.js, which only succeeds while the balance covers them.
 * Pass `tx` to run inside a caller's transaction.
 */
export async function recordLedgerEntry({
  userId,
  type,
  amount = 0,
  repDelta = 0,
  strikeDelta = 0,
  relatedProjectId = null,
  relatedCommitmentId = null,
  notes = '',
  tx = null
}) {
  const db = tx || prisma;

  const entry = await db.ledgerEntry.create({
    data: {
      userId,
      type,
      amount,
      relatedProjectId,
      relatedCommitmentId,
      notes: notes ? `${notes} (Rep: ${repDelta >= 0 ? '+' : ''}${repDelta}, Strikes: +${strikeDelta})` : null
    }
  });

  if (amount !== 0 || repDelta !== 0 || strikeDelta !== 0) {
    const user = await db.user.update({
      where: { id: userId },
      data: {
        credits: { increment: amount },
        reputation: { increment: repDelta },
        ghostStrikes: { increment: strikeDelta }
      }
    });
    // Reputation has a floor of 0, and 3 strikes stops someone claiming again.
    const fixes = {};
    if (user.reputation < 0) fixes.reputation = 0;
    if (user.ghostStrikes >= 3 && !user.banned) fixes.banned = true;
    if (Object.keys(fixes).length) await db.user.update({ where: { id: userId }, data: fixes });
  }

  return entry;
}
