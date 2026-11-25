/**
 * Runs before `next build` on Vercel production builds only.
 *
 * The production database URL is a Vercel "sensitive" variable that can't be
 * downloaded, so the build (which can read it) prepares the database itself:
 *   1. apply the Prisma schema additively: only the changes the app needs. Tables the app
 *      doesn't manage (e.g. Neon's sample table) are left alone, and any other change that
 *      would drop something stops the deploy instead of losing data.
 *   2. create the demo personas if there are no users yet
 *   3. add real open graves from GitHub if there are fewer than 20
 *
 * Safe to run on every deploy: it never deletes anything and skips work that's done.
 * (Unlike prisma/seed.js, which wipes all tables — never run that against production.)
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
if (!applySchema(directUrl)) process.exit(1);

// Works out what SQL would bring the database up to prisma/schema.prisma and applies only the
// safe part. `prisma db push` can't do this: it insists on dropping tables it doesn't know.
function applySchema(url) {
  // No shell on Linux (Vercel), so the URL's characters are never interpreted; Windows needs one for npx.
  const shell = process.platform === 'win32';
  const arg = value => (shell ? JSON.stringify(value) : value);
  const prisma = args => spawnSync('npx', ['prisma', ...args], { shell, encoding: 'utf8', env: process.env });

  const diff = prisma(['migrate', 'diff', '--from-url', arg(url), '--to-schema-datamodel', 'prisma/schema.prisma', '--script']);
  if (diff.status !== 0) {
    console.error('[db-setup] Could not compare the database with the schema:', diff.stderr);
    return false;
  }
  const managed = new Set([...fs.readFileSync('prisma/schema.prisma', 'utf8').matchAll(/^model\s+(\w+)/gm)].map(m => m[1]));
  const statements = diff.stdout
    .split(/;\s*(?:\r?\n|$)/)
    .map(sql => sql.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);

  const keep = [];
  for (const sql of statements) {
    const droppedTable = sql.match(/^DROP TABLE "([^"]+)"$/i)?.[1];
    if (droppedTable && !managed.has(droppedTable)) {
      console.log(`[db-setup] Leaving table "${droppedTable}" alone: the app doesn't manage it.`);
      continue;
    }
    if (/\bDROP\b/i.test(sql)) {
      console.error(`[db-setup] Refusing a change that would delete data:\n  ${sql}\nApply it by hand if it is really intended.`);
      return false;
    }
    keep.push(sql);
  }
  if (keep.length === 0) {
    console.log('[db-setup] Database already matches the schema.');
    return true;
  }
  const file = path.join(os.tmpdir(), `schema-${Date.now()}.sql`);
  fs.writeFileSync(file, keep.map(sql => `${sql};`).join('\n\n'));
  console.log(`[db-setup] Applying ${keep.length} schema change(s):\n${keep.map(sql => `  ${sql.split('\n')[0]}`).join('\n')}`);
  const result = prisma(['db', 'execute', '--file', arg(file), '--url', arg(url)]);
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  const ok = result.status === 0;
  fs.rmSync(file, { force: true });
  if (!ok) console.error('[db-setup] Applying the schema changes failed.');
  return ok;
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
