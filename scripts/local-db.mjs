/**
 * Zero-setup local PostgreSQL for development (no install, no admin rights).
 * Data lives in ./.pgdata (git-ignored).
 *
 *   npm run db:local          start the database and keep it running
 *   npm run dev:local         start the database AND the Next.js dev server against it
 *
 * Your .env is not touched: the local URL is passed to child processes directly.
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import EmbeddedPostgres from 'embedded-postgres';

export const LOCAL_DATABASE_URL = 'postgresql://postgres:graveyard@localhost:5433/graveyard';

const dataDir = path.resolve('.pgdata');
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'graveyard',
  port: 5433,
  persistent: true,
  // UTF-8 explicitly: on Windows initdb otherwise picks WIN1252, which can't store emoji.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {}
});

async function main() {
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (firstRun) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase('graveyard');
  } catch {
    // already exists
  }
  console.log(`Local Postgres running: ${LOCAL_DATABASE_URL}`);

  const stop = async () => {
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  if (process.argv.includes('--dev')) {
    const env = { ...process.env, DATABASE_URL: LOCAL_DATABASE_URL };
    const run = (args) => new Promise(resolve => {
      const child = spawn('npx', args, { stdio: 'inherit', env, shell: true });
      child.on('exit', resolve);
    });
    await run(['prisma', 'db', 'push', '--skip-generate']);
    const dev = spawn('npx', ['next', 'dev', '-p', '3000'], { stdio: 'inherit', env, shell: true });
    dev.on('exit', stop);
  } else {
    console.log('Press Ctrl+C to stop.');
  }
}

main().catch(async err => {
  console.error(err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
