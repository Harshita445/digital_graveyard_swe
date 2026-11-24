import { createSchema } from 'graphql-yoga';
import { parse, execute } from 'graphql';
import { typeDefs } from '../lib/graphql/typeDefs.js';
import { resolvers } from '../lib/graphql/resolvers.js';
import prisma from '../lib/prisma.js';

const schema = createSchema({ typeDefs, resolvers });
const run = (q, user, v = {}) => execute({ schema, document: parse(q), variableValues: v, contextValue: { currentUser: user } });
let fails = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails++; };

const [a, b] = await prisma.user.findMany({ where: { NOT: { email: 'curator@digital-graveyard.local' } }, take: 2 });
const project = await prisma.project.findFirst();
const entry = await prisma.ledgerEntry.create({ data: { userId: a.id, amount: 1, type: 'REP_DELTA', notes: 'security test' } }).catch(e => { console.log('ledger create:', e.message); return null; });

try {
  const L = 'query($u: ID){ ledgerEntries(userId: $u){ id userId } }';
  let r = await run(L, null);
  check('signed out cannot read ledgers', r.errors?.[0]?.message === 'Authentication required');
  r = await run(L, b, { u: a.id });
  check("B cannot read A's ledger", /own ledger/.test(r.errors?.[0]?.message || ''));
  r = await run(L, b);
  check('B with no userId only gets own rows', !r.errors && r.data.ledgerEntries.every(e => e.userId === b.id));
  r = await run(L, a);
  check('A can read own ledger', !r.errors && (!entry || r.data.ledgerEntries.some(e => e.id === entry.id)));
  r = await run('query($id: ID!){ user(id: $id){ ledgerEntries { id } } }', b, { id: a.id });
  check("nested user.ledgerEntries hidden from B", !r.errors && r.data.user && r.data.user.ledgerEntries.length === 0);

  // Nothing that moves credits can be done through GraphQL: those rules live only in the REST routes.
  for (const name of ['createProject', 'commitToProject', 'approveCommitment', 'submitDeliverable', 'acceptDelivery', 'rejectDelivery', 'completeMilestone']) {
    check(`GraphQL has no ${name} mutation`, !(name in schema.getMutationType().getFields()));
  }
  void project;
} finally {
  if (entry) await prisma.ledgerEntry.delete({ where: { id: entry.id } });
  await prisma.$disconnect();
}
console.log(fails ? `${fails} FAILED` : 'ALL SECURITY CHECKS PASSED');
process.exit(fails ? 1 : 0);
