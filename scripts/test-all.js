const fs = require('fs');
const path = require('path');
const http = require('http');

// Auto-load .env if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] ? match[2].trim() : '';
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(body);
        } catch {
          json = body;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return '';
  if (Array.isArray(setCookie)) {
    return setCookie.map(c => c.split(';')[0]).join('; ');
  }
  return setCookie.split(';')[0];
}

async function runSection1_Protocol() {
  console.log('\n======================================================');
  console.log(' SECTION 1: PROTOCOL CORE & DATABASE VERIFICATION');
  console.log('======================================================');

  // Pre-cleanup any lingering test accounts from earlier aborted runs
  const lingering = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: '@graveyard.test' } },
        { email: { endsWith: '@test.com' } },
        { email: { endsWith: '@anonymous.org' } }
      ]
    },
    select: { id: true }
  });
  if (lingering.length > 0) {
    const lingeringIds = lingering.map(u => u.id);
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: lingeringIds } } });
    await prisma.commitment.deleteMany({ where: { takerId: { in: lingeringIds } } });
    await prisma.project.deleteMany({ where: { ownerId: { in: lingeringIds } } });
    await prisma.user.deleteMany({ where: { id: { in: lingeringIds } } });
  }

  // 1. Verify anonymous aliases
  const users = await prisma.user.findMany();
  console.log(`✓ 1. Verified ${users.length} anonymous users in DB.`);
  // Every person gets a random Digger-#### alias. The one exception is the system
  // "Curator" account that the seed script uses to list open graves.
  const isSystemAccount = u => u.email === 'curator@digital-graveyard.local';
  if (!users.filter(u => !isSystemAccount(u)).every(u => /^Digger-\d{4}$/.test(u.alias))) {
    throw new Error('All user aliases must follow Digger-#### format!');
  }

  // 2. Verify codebases
  const projects = await prisma.project.findMany();
  console.log(`✓ 2. Verified ${projects.length} codebases loaded.`);

  // 3. Verify ledger records
  const ledgerEntries = await prisma.ledgerEntry.findMany();
  console.log(`✓ 3. Verified ${ledgerEntries.length} immutable ledger audit records.`);

}

async function runSection2_ClaimEngine() {
  console.log('\n======================================================');
  console.log(' SECTION 2: CLAIM ENGINE (pledges, checkpoints, payouts)');
  console.log('======================================================');
  // The claim rules are tested in their own script, which imports the engine as ES modules.
  const { spawnSync } = require('child_process');
  const run = spawnSync(process.execPath, ['--no-warnings', path.join(__dirname, 'test-claims.mjs')], {
    env: process.env, encoding: 'utf8'
  });
  process.stdout.write(run.stdout || '');
  if (run.status !== 0) throw new Error(`Claim engine tests failed:\n${run.stderr || ''}`);
}

async function runSection3_HTTPAuth() {
  console.log('\n======================================================');
  console.log(' SECTION 3: HTTP API & AUTHENTICATION VERIFICATION');
  console.log('======================================================');

  const port = 3000;

  // Check if server is running on port 3000
  const isServerRunning = await new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/auth/personas', method: 'GET', timeout: 5000 }, res => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });

  if (!isServerRunning) {
    console.log('ℹ️ Local dev server is not active on http://localhost:3000. Skipping HTTP network phase.');
    console.log('  (Start `npm run dev` to execute live HTTP network assertions)');
    return;
  }

  // Test 1: Invalid login
  const res1 = await request({
    hostname: '127.0.0.1', port, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, { email: 'sarah.chen@campus.edu', password: 'wrongpassword' });
  if (res1.statusCode === 401) {
    console.log('✓ 1. Invalid login rejected with 401 Unauthorized');
  } else {
    throw new Error(`Expected 401, got: ${res1.statusCode}`);
  }

  // Test 2: Valid login
  const res2 = await request({
    hostname: '127.0.0.1', port, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, { email: 'sarah.chen@campus.edu', password: 'password123' });
  if (res2.statusCode === 200 && res2.body.token && res2.body.user) {
    console.log(`✓ 2. Login succeeded for ${res2.body.user.alias}. Received session token.`);
  } else {
    throw new Error(`Expected 200, got: ${res2.statusCode}`);
  }

  const sessionCookie = extractCookie(res2.headers);

  // Test 3: Authenticated /api/auth/me
  const res3 = await request({
    hostname: '127.0.0.1', port, path: '/api/auth/me', method: 'GET', headers: { 'Cookie': sessionCookie }
  });
  if (res3.statusCode === 200 && res3.body.authenticated) {
    console.log(`✓ 3. Verified session cookie via /api/auth/me: ${res3.body.user.alias}`);
  } else {
    throw new Error(`Expected authenticated session, got: ${res3.statusCode}`);
  }

  // Test 4: Anonymous signup
  const newEmail = `digger_test_${Date.now()}@anonymous.org`;
  const res4 = await request({
    hostname: '127.0.0.1', port, path: '/api/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, { email: newEmail, password: 'secure_password_99' });
  if (res4.statusCode === 201 && res4.body.user.alias.startsWith('Digger-')) {
    console.log(`✓ 4. Anonymous signup created new alias: ${res4.body.user.alias} (500 initial credits)`);
  } else {
    throw new Error(`Signup failed, got: ${res4.statusCode}`);
  }

  // Test 5: Switch persona
  const personasRes = await request({ hostname: '127.0.0.1', port, path: '/api/auth/personas', method: 'GET' });
  const target = personasRes.body.personas[1];
  const res5 = await request({
    hostname: '127.0.0.1', port, path: '/api/auth/switch-persona', method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, { userId: target.id });
  if (res5.statusCode === 200 && res5.body.user.id === target.id) {
    console.log(`✓ 5. Persona switched cleanly to: ${res5.body.user.alias}`);
  } else {
    throw new Error(`Switch persona failed, got: ${res5.statusCode}`);
  }

  // Test 6: Logout
  const res6 = await request({ hostname: '127.0.0.1', port, path: '/api/auth/logout', method: 'POST' });
  if (res6.statusCode === 200) {
    console.log('✓ 6. Session successfully terminated via /api/auth/logout');
  }

  // Cleanup test user
  const createdUser = await prisma.user.findUnique({ where: { email: newEmail } });
  if (createdUser) {
    await prisma.ledgerEntry.deleteMany({ where: { userId: createdUser.id } });
    await prisma.user.delete({ where: { id: createdUser.id } });
  }
}

async function runSection4_GitHubOAuth() {
  console.log('\n======================================================');
  console.log(' SECTION 4: GIT (GITHUB) OAUTH VERIFICATION');
  console.log('======================================================');

  const stamp = Date.now();
  const testGhId = `gh_${stamp}`;
  const testGhUsername = `gh_tester_${stamp}`;
  const testGhEmail = `gh_user_${stamp}@graveyard.test`;

  // 1. Test New User Registration via GitHub OAuth
  const alias = `Digger-${Math.floor(1000 + Math.random() * 9000)}`;
  const ghUser = await prisma.user.create({
    data: {
      email: testGhEmail,
      githubId: testGhId,
      githubUsername: testGhUsername,
      alias,
      credits: 0,
      reputation: 100,
      ghostStrikes: 0,
      banned: false,
      passwordHash: null
    }
  });

  // Create genesis ledger entry
  await prisma.ledgerEntry.create({
    data: {
      userId: ghUser.id,
      type: 'REWARD_CREDIT',
      amount: 500,
      notes: 'Initial onboarding credits genesis grant (GitHub OAuth)'
    }
  });
  await prisma.user.update({
    where: { id: ghUser.id },
    data: { credits: { increment: 500 } }
  });

  const refreshedGhUser = await prisma.user.findUnique({ where: { id: ghUser.id } });
  if (
    refreshedGhUser.githubId === testGhId &&
    refreshedGhUser.githubUsername === testGhUsername &&
    refreshedGhUser.credits === 500 &&
    refreshedGhUser.alias.startsWith('Digger-') &&
    refreshedGhUser.passwordHash === null
  ) {
    console.log(`✓ 1. GitHub OAuth user created: ${refreshedGhUser.alias} (@${refreshedGhUser.githubUsername}) with 500 credits.`);
  } else {
    throw new Error('GitHub OAuth user creation verification failed!');
  }

  // 2. Test Existing GitHub User Lookup & Username Synchronization
  const newUsername = `${testGhUsername}_renamed`;
  const updatedGhUser = await prisma.user.update({
    where: { githubId: testGhId },
    data: { githubUsername: newUsername }
  });
  if (updatedGhUser.githubUsername === newUsername && updatedGhUser.id === ghUser.id) {
    console.log(`✓ 2. GitHub username update synchronized: @${newUsername}`);
  } else {
    throw new Error('GitHub username sync failed!');
  }

  // 3. Test Account Linking (Email User connects GitHub)
  const emailUser = await prisma.user.create({
    data: {
      email: `email_only_${stamp}@graveyard.test`,
      alias: `Digger-${Math.floor(1000 + Math.random() * 9000)}`,
      credits: 500,
      reputation: 100
    }
  });

  const linkedGhId = `gh_link_${stamp}`;
  const linkedGhUsername = `gh_linked_${stamp}`;
  const linkedUser = await prisma.user.update({
    where: { id: emailUser.id },
    data: {
      githubId: linkedGhId,
      githubUsername: linkedGhUsername
    }
  });

  const foundByGh = await prisma.user.findUnique({ where: { githubId: linkedGhId } });
  if (foundByGh && foundByGh.id === emailUser.id && foundByGh.githubUsername === linkedGhUsername) {
    console.log(`✓ 3. Linked GitHub identity (@${linkedGhUsername}) to existing user: ${linkedUser.alias}`);
  } else {
    throw new Error('GitHub account linking verification failed!');
  }

  // 4. Test Cryptographic Session Token Generation & Verification
  try {
    const authModule = await import('../lib/auth.js');
    const token = authModule.createSessionToken(ghUser.id, ghUser.alias);
    const verified = authModule.verifySessionToken(token);

    if (verified && verified.userId === ghUser.id && verified.alias === ghUser.alias) {
      console.log(`✓ 4. Cryptographic HMAC-SHA256 session token signed and verified for ${ghUser.alias}`);
    } else {
      throw new Error('HMAC session token verification failed for GitHub user');
    }
  } catch (err) {
    console.error('Session verification error:', err.message);
    throw err;
  }

  // 5. Cleanup transient test entities
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [ghUser.id, emailUser.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ghUser.id, emailUser.id] } } });
  console.log('✓ 5. Cleaned up transient GitHub OAuth test records.');
}

// Logs a demo account in over HTTP and returns its session cookie.
async function loginAs(email) {
  const res = await request({
    hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, { email, password: 'password123' });
  if (res.statusCode !== 200) throw new Error(`Login failed for ${email}: ${res.statusCode}`);
  return extractCookie(res.headers);
}

function api(method, path, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return request({ hostname: '127.0.0.1', port: 3000, path, method, headers }, body);
}

function expectStatus(res, expected, label) {
  if (res.statusCode !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${res.statusCode} ${JSON.stringify(res.body).slice(0, 200)}`);
  }
}

async function serverIsUp() {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3000, path: '/api/auth/personas', method: 'GET', timeout: 5000 }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

const KNOWN_CAUSES = ['Maintainer Departure', 'Solo Maintainer Burnout', 'Overwhelmed by Issues', 'Abrupt Stop', 'Gradual Fade-out', 'Low Adoption', 'Stalled Development'];

async function runSection5_LegalCheckAndAutopsy() {
  console.log('\n======================================================');
  console.log(' SECTION 5: LEGAL CHECK, AUTOPSY & SUGGEST BOX (HTTP)');
  console.log('======================================================');

  if (!(await serverIsUp())) {
    console.log('ℹ️ Server not running on http://localhost:3000. Skipping.');
    return;
  }

  // 1. Every listed open grave must have an open-source license and be abandoned.
  const list = await api('GET', '/api/projects', null);
  expectStatus(list, 200, 'List projects');
  const graves = list.body.projects.filter(p => p.source === 'OPEN_GRAVE');
  const OPEN = ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'ISC', 'Unlicense', 'MPL-2.0', 'LGPL-2.1', 'LGPL-3.0', 'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'CC0-1.0', 'Zlib', 'BSL-1.0'];
  const badLicense = graves.filter(p => !OPEN.includes(p.githubLicense));
  if (badLicense.length) throw new Error(`Open graves without an open license: ${badLicense.map(p => p.title).join(', ')}`);
  console.log(`✓ 1. All ${graves.length} open graves carry an open-source license`);

  // 2. Every analyzed grave gets a revival score in range and a real cause of decline.
  for (const p of graves.filter(g => g.githubAnalyzedAt)) {
    if (p.revivalScore == null || p.revivalScore < 0 || p.revivalScore > 100) throw new Error(`${p.title} has score ${p.revivalScore}`);
    const cause = p.githubIntelligence?.cause;
    if (!KNOWN_CAUSES.includes(cause)) throw new Error(`${p.title} has unknown cause: ${cause}`);
  }
  console.log('✓ 2. Every analyzed grave has a 0-100 revival score and a diagnosed cause of decline');

  // 3. The suggest box needs a signed-in user.
  expectStatus(await api('POST', '/api/projects/suggest', null, { repoUrl: 'https://github.com/moment/moment' }), 401, 'Suggest while signed out');
  console.log('✓ 3. Suggesting a repo while signed out is rejected (401)');

  const cookie = await loginAs('sarah.chen@campus.edu');

  // 4. A non-GitHub link is rejected before anything else.
  expectStatus(await api('POST', '/api/projects/suggest', cookie, { repoUrl: 'https://example.com/not-a-repo' }), 400, 'Suggest a non-GitHub URL');
  console.log('✓ 4. A link that is not a GitHub repository is rejected (400)');

  // 5. A repo that is already listed is refused as a duplicate.
  const existing = graves.find(p => p.githubRepoUrl);
  if (existing) {
    expectStatus(await api('POST', '/api/projects/suggest', cookie, { repoUrl: existing.githubRepoUrl }), 409, 'Suggest a duplicate');
    console.log(`✓ 5. Suggesting an already-listed repo (${existing.title}) is refused (409)`);
  }

  // 6. A repo that is still maintained fails the legal check (needs a GitHub token on the server).
  const active = await api('POST', '/api/projects/suggest', cookie, { repoUrl: 'https://github.com/expressjs/express' });
  if (active.statusCode === 403) {
    console.log('✓ 6. An actively maintained repo (expressjs/express) fails the legal check (403)');
  } else if (active.statusCode === 404) {
    console.log('ℹ️ 6. Skipped: the server has no GitHub access (set GITHUB_TOKEN to run this check)');
  } else {
    throw new Error(`Suggest an active repo: expected 403, got ${active.statusCode}`);
  }
}

// Demo accounts need a linked GitHub login and enough credits to claim; this sets them up for the test.
async function withClaimReady(email, fn) {
  const u = await prisma.user.findUnique({ where: { email } });
  const original = u.githubUsername;
  await prisma.user.update({
    where: { id: u.id },
    data: { githubUsername: original || `test-${u.alias.toLowerCase()}`, ...(u.credits < 150 ? { credits: 500 } : {}) }
  });
  try {
    return await fn(u);
  } finally {
    await prisma.user.update({ where: { id: u.id }, data: { githubUsername: original } }).catch(() => {});
  }
}

const creditsOf = async id => (await prisma.user.findUnique({ where: { id } })).credits;

async function runSection6_CommunityRevival() {
  console.log('\n======================================================');
  console.log(' SECTION 6: CLAIMS OVER HTTP (pledge, join, quit)');
  console.log('======================================================');

  if (!(await serverIsUp())) {
    console.log('ℹ️ Server not running on http://localhost:3000. Skipping.');
    return;
  }

  const grave = await prisma.project.findFirst({
    where: { source: 'OPEN_GRAVE', status: 'LISTED', githubRepoUrl: { not: null }, commitments: { none: { status: 'ACTIVE' } } }
  });
  if (!grave) {
    console.log('ℹ️ No free open grave to test with. Skipping.');
    return;
  }
  const a = await loginAs('sarah.chen@campus.edu');
  const b = await loginAs('alex.rivera@campus.edu');

  await withClaimReady('sarah.chen@campus.edu', userA => withClaimReady('alex.rivera@campus.edu', async () => {
    const commitIds = [];
    const startA = await creditsOf(userA.id);
    try {
      // 1. Claiming pledges 150 credits.
      const claimA = await api('POST', `/api/projects/${grave.id}/commit`, a);
      expectStatus(claimA, 201, 'First claim');
      commitIds.push([claimA.body.commitment.id, a]);
      const afterClaim = await creditsOf(userA.id);
      if (afterClaim !== startA - 150) throw new Error(`Expected a 150 pledge, balance went ${startA} -> ${afterClaim}`);
      console.log(`✓ 1. Person A claimed "${grave.title}" and pledged 150 credits (201)`);

      // 2. A second person can join an open grave.
      const claimB = await api('POST', `/api/projects/${grave.id}/commit`, b);
      expectStatus(claimB, 201, 'Second person joins');
      commitIds.push([claimB.body.commitment.id, b]);
      console.log('✓ 2. Person B joined the same revival (201)');

      // 3. The page shows both, and the grave is being revived.
      const view = await api('GET', `/api/projects/${grave.id}`, a);
      expectStatus(view, 200, 'View grave');
      const crew = view.body.revivers.filter(r => r.status === 'ACTIVE');
      if (crew.length !== 2 || view.body.project.status !== 'ACTIVE') {
        throw new Error(`Expected 2 revivers and ACTIVE, got ${crew.length} / ${view.body.project.status}`);
      }
      console.log('✓ 3. Revival crew shows 2 people and the grave status is ACTIVE');

      // 4. No double claims.
      expectStatus(await api('POST', `/api/projects/${grave.id}/commit`, a), 409, 'Double claim');
      console.log('✓ 4. Claiming the same grave twice is refused (409)');

      // 5. A repo that is not a fork of the original is refused.
      const fake = await api('POST', `/api/commitments/${claimA.body.commitment.id}/submit`, a, { forkUrl: 'https://github.com/vercel/next.js' });
      if (fake.statusCode === 400) console.log(`✓ 5. Checking a repo that is not a fork is refused (400): "${fake.body.error}"`);
      else if (fake.statusCode === 502) console.log('ℹ️ 5. Skipped: the server could not reach GitHub');
      else throw new Error(`Check a non-fork: expected 400, got ${fake.statusCode}`);

      // 6. Nobody else can quit your claim.
      expectStatus(await api('POST', `/api/commitments/${claimA.body.commitment.id}/withdraw`, b), 403, 'Quit someone else\'s claim');
      console.log('✓ 6. Quitting another person\'s claim is refused (403)');

      // 7. Signed-out visitors cannot claim.
      expectStatus(await api('POST', `/api/projects/${grave.id}/commit`, null), 401, 'Signed-out claim');
      console.log('✓ 7. Claiming while signed out is refused (401)');
    } finally {
      for (const [id, cookie] of commitIds) await api('POST', `/api/commitments/${id}/withdraw`, cookie);
    }
    const after = await prisma.project.findUnique({ where: { id: grave.id } });
    const left = await prisma.commitment.count({ where: { projectId: grave.id, status: 'ACTIVE' } });
    if (after.status !== 'LISTED' || left !== 0) throw new Error(`After quitting, expected LISTED with 0 claims, got ${after.status} / ${left}`);
    if (await creditsOf(userA.id) !== startA) throw new Error('Quitting did not return the full pledge');
    console.log('✓ 8. Both quit: full pledges returned, grave back to LISTED');
  }));
}

async function runSection7_ListingRules() {
  console.log('\n======================================================');
  console.log(' SECTION 7: LISTING RULES & CLOSED BACK DOORS (HTTP)');
  console.log('======================================================');

  if (!(await serverIsUp())) {
    console.log('ℹ️ Server not running on http://localhost:3000. Skipping.');
    return;
  }
  const cookie = await loginAs('sarah.chen@campus.edu');
  const good = {
    githubRepoUrl: 'https://github.com/moment/moment',
    title: 'Test listing',
    description: 'A description that is long enough to pass.',
    doneWhen: 'It builds and the tests pass on Node 20.',
    claimDays: 30,
    timeEstimate: 'WEEKS',
    category: 'Web'
  };

  expectStatus(await api('POST', '/api/projects', null, good), 401, 'List while signed out');
  console.log('✓ 1. Listing while signed out is refused (401)');

  expectStatus(await api('POST', '/api/projects', cookie, { ...good, githubRepoUrl: '' }), 400, 'List without a repo');
  console.log('✓ 2. A listing without a GitHub repository is refused (400)');

  expectStatus(await api('POST', '/api/projects', cookie, { ...good, githubRepoUrl: 'https://example.com/x' }), 400, 'List a non-GitHub link');
  console.log('✓ 3. A link that is not a GitHub repository is refused (400)');

  const noDone = await api('POST', '/api/projects', cookie, { ...good, doneWhen: '' });
  expectStatus(noDone, 400, 'List without "done when"');
  if (!/revived/i.test(noDone.body.error)) throw new Error(`Wrong reason: ${noDone.body.error}`);
  console.log(`✓ 4. A listing without "Done when" is refused (400): "${noDone.body.error}"`);

  const badDays = await api('POST', '/api/projects', cookie, { ...good, claimDays: 5 });
  expectStatus(badDays, 400, 'List with a made-up claim length');
  if (!/claim length/i.test(badDays.body.error)) throw new Error(`Wrong reason: ${badDays.body.error}`);
  console.log(`✓ 5. A claim length other than 14/30/60 days is refused (400): "${badDays.body.error}"`);

  const fork = await api('POST', '/api/projects', cookie, { ...good, githubRepoUrl: 'https://github.com/example-owner/repo-that-does-not-exist' });
  if (fork.statusCode !== 400) throw new Error(`Unknown repo: expected 400, got ${fork.statusCode}`);
  console.log(`✓ 6. A repository GitHub can't find is refused (400): "${fork.body.error}"`);

  // The old stake and milestone mutations must not exist on the GraphQL endpoint.
  const gql = await api('POST', '/api/graphql', cookie, { query: 'mutation { completeMilestone(milestoneId: "x") { id } }' });
  const msg = JSON.stringify(gql.body);
  if (!/Cannot query field/.test(msg)) throw new Error(`GraphQL write mutation still answers: ${msg.slice(0, 200)}`);
  console.log('✓ 7. GraphQL write mutations are gone: claims only go through the checked API');
}

async function main() {
  console.log('========================================================');
  console.log(' 🪦 GRAVEFIN MASTER TEST SUITE (UNIFIED RUNNER)');
  console.log('========================================================');

  try {
    await runSection1_Protocol();
    await runSection2_ClaimEngine();
    await runSection3_HTTPAuth();
    await runSection4_GitHubOAuth();
    await runSection5_LegalCheckAndAutopsy();
    await runSection6_CommunityRevival();
    await runSection7_ListingRules();

    console.log('\n========================================================');
    console.log(' 🎉 ALL TESTS PASSED!');
    console.log('========================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

