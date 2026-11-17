/**
 * Runs before `next build` on Vercel production builds only.
 *
 * The production database URL is a Vercel "sensitive" variable that can't be
 * downloaded, so the build (which can read it) prepares the database itself:
 *   1. apply the Prisma schema (additive `db push`, never --accept-data-loss)
 *   2. create the demo personas if there are no users yet
 *   3. add real open graves from GitHub if there are fewer than 20
 *
 * Safe to run on every deploy: it never deletes anything and skips work that's done.
 * (Unlike prisma/seed.js, which wipes all tables — never run that against production.)
 */
import { spawnSync } from 'child_process';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const TARGET_GRAVES = 20;

if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'production') {
  console.log('[db-setup] Not a Vercel production build — skipping database setup.');
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.log('[db-setup] DATABASE_URL is not set — skipping database setup.');
  process.exit(0);
}

const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  return result.status === 0;
};

// Schema changes go through the direct (unpooled) connection when Neon provides one.
const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!run('npx', ['prisma', 'db', 'push', '--skip-generate'], { DATABASE_URL: directUrl })) {
  console.error('[db-setup] prisma db push failed (it refuses changes that would lose data).');
  process.exit(1);
}

const PERSONAS = [
  { email: 'sarah.chen@campus.edu', alias: 'Digger-1042', credits: 850, reputation: 140, ghostStrikes: 0 },
  { email: 'alex.rivera@campus.edu', alias: 'Digger-2099', credits: 600, reputation: 125, ghostStrikes: 0 },
  { email: 'elena.rostova@campus.edu', alias: 'Digger-3310', credits: 450, reputation: 95, ghostStrikes: 1 },
  { email: 'marcus.vance@campus.edu', alias: 'Digger-5501', credits: 250, reputation: 60, ghostStrikes: 2 },
  { email: 'chloe.zhao@campus.edu', alias: 'Digger-7700', credits: 720, reputation: 130, ghostStrikes: 0 },
  { email: 'devbot@graveyard.fi', alias: 'Digger-9999', credits: 1000, reputation: 200, ghostStrikes: 0 }
];

const prisma = new PrismaClient();
try {
  const users = await prisma.user.count();
  if (users === 0) {
    const passwordHash = await bcrypt.hash('password123', 10);
    for (const persona of PERSONAS) {
      await prisma.user.create({ data: { ...persona, passwordHash } });
    }
    console.log(`[db-setup] Created ${PERSONAS.length} demo personas.`);
  } else {
    console.log(`[db-setup] ${users} users already exist — personas left as they are.`);
  }

  const graves = await prisma.project.count({ where: { source: 'OPEN_GRAVE' } });
  await prisma.$disconnect();

  if (graves >= TARGET_GRAVES) {
    console.log(`[db-setup] ${graves} open graves already present — nothing to seed.`);
  } else if (!process.env.GITHUB_TOKEN) {
    console.log('[db-setup] GITHUB_TOKEN not set — cannot analyze repos, skipping open-grave seeding.');
  } else {
    console.log(`[db-setup] ${graves} open graves present; seeding up to ${TARGET_GRAVES}.`);
    // Not fatal: a GitHub hiccup should not block the deploy.
    run('node', ['scripts/seed-open-graves.mjs', '2', `--limit=${TARGET_GRAVES}`]);
  }
} catch (err) {
  console.error('[db-setup] Setup failed:', err.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
