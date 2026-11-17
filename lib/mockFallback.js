// Fallback dataset and client-side demo persistence for GitHub Pages / Static Export mode

// The sample data below is only used by a static export with no server
// (NEXT_PUBLIC_STATIC_DEMO=true). The real site never shows it.
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === 'true';

export const FALLBACK_PERSONAS = [
  {
    id: 'user-1',
    email: 'sarah.chen@campus.edu',
    alias: 'Digger-1042',
    credits: 850,
    reputation: 140,
    ghostStrikes: 0,
    banned: false
  },
  {
    id: 'user-2',
    email: 'alex.rivera@campus.edu',
    alias: 'Digger-2099',
    credits: 600,
    reputation: 125,
    ghostStrikes: 0,
    banned: false
  },
  {
    id: 'user-3',
    email: 'elena.rostova@campus.edu',
    alias: 'Digger-3310',
    credits: 450,
    reputation: 95,
    ghostStrikes: 1,
    banned: false
  },
  {
    id: 'user-4',
    email: 'marcus.vance@campus.edu',
    alias: 'Digger-5501',
    credits: 250,
    reputation: 60,
    ghostStrikes: 2,
    banned: false
  },
  {
    id: 'user-5',
    email: 'chloe.zhao@campus.edu',
    alias: 'Digger-7700',
    credits: 720,
    reputation: 130,
    ghostStrikes: 0,
    banned: false
  },
  {
    id: 'user-6',
    email: 'devbot@graveyard.fi',
    alias: 'Digger-9999',
    credits: 1000,
    reputation: 200,
    ghostStrikes: 0,
    banned: false
  }
];

export const FALLBACK_PROJECTS = [
  {
    id: 'p1',
    ownerId: 'user-1',
    owner: FALLBACK_PERSONAS[0],
    title: 'AI Adaptive Study Plan Generator',
    description: 'Generates personalized, high-yield study timetables by parsing course syllabi PDFs and canvas deadline feeds. Core parsing engine and heuristic difficulty scoring are complete; needs React calendar widget, user authentication, and export to iCal/Google Calendar.',
    category: 'AI/ML',
    techTags: JSON.stringify(['Python', 'FastAPI', 'React', 'SQLite', 'LangChain']),
    stakeRequired: 120,
    completion: 65,
    milestoneMode: true,
    status: 'LISTED',
    fileName: 'ai_study_planner_v0.6.zip',
    fileUrl: '/downloads/ai_study_planner_v0.6.zip',
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    commitments: []
  },
  {
    id: 'p2',
    ownerId: 'user-1',
    owner: FALLBACK_PERSONAS[0],
    title: 'Campus Shuttle Live Radar & Dispatch',
    description: 'Real-time telemetry tracking for university campus loop shuttles. WebSocket server and Leaflet map rendering are functional; ETA prediction algorithms and offline driver reconnect logic are pending implementation.',
    category: 'Web',
    techTags: JSON.stringify(['React', 'Node.js', 'WebSockets', 'Leaflet', 'GeoJSON']),
    stakeRequired: 80,
    completion: 40,
    milestoneMode: false,
    status: 'PENDING_APPROVAL',
    fileName: 'campus_shuttle_tracker.zip',
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    commitments: [
      {
        id: 'c2',
        projectId: 'p2',
        takerId: 'user-3',
        taker: FALLBACK_PERSONAS[2],
        status: 'PENDING_APPROVAL',
        stakeLocked: 0,
        committedAt: new Date(Date.now() - 86400000).toISOString()
      }
    ]
  },
  {
    id: 'p3',
    ownerId: 'user-1',
    owner: FALLBACK_PERSONAS[0],
    title: 'Local Grocery Co-op & Bulk Order Splitter',
    description: 'Community bulk organic food ordering platform featuring split carts and neighborhood pickup logistics. Shopping cart splitting logic works; needs vendor PDF invoice generation and automated SMS/email pickup alerts.',
    category: 'Web',
    techTags: JSON.stringify(['Next.js', 'Tailwind', 'PostgreSQL', 'Stripe Mock']),
    stakeRequired: 100,
    completion: 55,
    milestoneMode: true,
    status: 'ACTIVE',
    fileName: 'grocery_coop_platform.zip',
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    commitments: [
      {
        id: 'c3',
        projectId: 'p3',
        takerId: 'user-2',
        taker: FALLBACK_PERSONAS[1],
        status: 'ACTIVE',
        stakeLocked: 100,
        committedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
        ghostDeadlineAt: new Date(Date.now() + 11 * 86400000).toISOString(),
        milestones: [
          { id: 'm1', title: 'M1: Setup database schema and mock vendor seeds', status: 'MET' },
          { id: 'm2', title: 'M2: PDF Invoice Generation with headless Chromium', status: 'PENDING' },
          { id: 'm3', title: 'M3: Delivery dispatch worker & webhook notifications', status: 'PENDING' }
        ]
      }
    ]
  },
  {
    id: 'p4',
    ownerId: 'user-2',
    owner: FALLBACK_PERSONAS[1],
    title: 'Edge Sensor IoT Environmental Monitor',
    description: 'Raspberry Pi Pico wireless sensor mesh reporting ambient temperature, particulate PM2.5, and CO2 levels over LoRa. Firmware and backend storage pipeline are built; needs frontend calibration dashboard and alerting threshold UI.',
    category: 'IoT',
    techTags: JSON.stringify(['Embedded C', 'Python', 'MQTT', 'Chart.js', 'Raspberry Pi']),
    stakeRequired: 100,
    completion: 85,
    milestoneMode: false,
    status: 'SUBMITTED',
    fileName: 'edge_sensor_iot.zip',
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    commitments: [
      {
        id: 'c4',
        projectId: 'p4',
        takerId: 'user-3',
        taker: FALLBACK_PERSONAS[2],
        status: 'SUBMITTED',
        stakeLocked: 100,
        submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        submissionNotes: 'Completed Chart.js sensor calibration widget, added LoRa node simulation runner, and verified live polling updates.',
        submissionUrl: '/downloads/edge_sensor_deliverable.zip'
      }
    ]
  },
  {
    id: 'p5',
    ownerId: 'user-3',
    owner: FALLBACK_PERSONAS[2],
    title: 'Minimalist Markdown Knowledge Base',
    description: 'Local-first hierarchical notes app featuring bidirectional wikilinks, graph visualization, and instant full-text client indexing. Successfully finished and verified by Digger-2099.',
    category: 'Web',
    techTags: JSON.stringify(['React', 'TypeScript', 'IndexedDB', 'WASM', 'D3.js']),
    stakeRequired: 100,
    completion: 100,
    milestoneMode: false,
    status: 'COMPLETED',
    fileName: 'markdown_knowledge_base.zip',
    createdAt: new Date(Date.now() - 22 * 86400000).toISOString(),
    commitments: [
      {
        id: 'c5',
        projectId: 'p5',
        takerId: 'user-2',
        taker: FALLBACK_PERSONAS[1],
        status: 'COMPLETED',
        stakeLocked: 0,
        submissionNotes: 'Implemented SQLite WASM full-text search index and interactive D3 node graph.'
      }
    ]
  },
  {
    id: 'p6',
    ownerId: 'user-1',
    owner: FALLBACK_PERSONAS[0],
    title: 'Solana DEX Arbitrage Speed Bot',
    description: 'High-frequency mempool scanner that detects price discrepancies across Raydium and Orca liquidity pools. Original taker ghosted after 14 days without communication. Code base unlocked and stake forfeited to community pool; ready for fresh revival.',
    category: 'Web3',
    techTags: JSON.stringify(['Rust', 'Solana Web3.js', 'Anchor', 'Node.js']),
    stakeRequired: 150,
    completion: 50,
    milestoneMode: true,
    status: 'GHOSTED_RELISTED',
    fileName: 'solana_dex_arbitrage.zip',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    commitments: []
  },
  {
    id: 'p7',
    ownerId: 'user-5',
    owner: FALLBACK_PERSONAS[4],
    title: 'WebAssembly Modular Audio Synth & DAW',
    description: 'In-browser modular polyphonic synthesizer with custom visual patch cords and oscilloscope spectrum analyzer. C++ DSP core compiles to WASM; needs Web Audio API worklet integration and MIDI keyboard event listeners.',
    category: 'DevTools',
    techTags: JSON.stringify(['C++', 'WebAssembly', 'Web Audio API', 'React', 'Canvas']),
    stakeRequired: 140,
    completion: 70,
    milestoneMode: true,
    status: 'LISTED',
    fileName: 'wasm_audio_synth.zip',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    commitments: []
  },
  {
    id: 'p8',
    ownerId: 'user-5',
    owner: FALLBACK_PERSONAS[4],
    title: 'Zero-Knowledge Identity Attestation Vault',
    description: 'Privacy-preserving credentials verification protocol using zk-SNARK circuits. Prover circuits and smart contract verifier are written; requires frontend QR scanning widget and proof generation loading states.',
    category: 'Security',
    techTags: JSON.stringify(['Circom', 'SnarkJS', 'Next.js', 'Solidity', 'Tailwind']),
    stakeRequired: 160,
    completion: 45,
    milestoneMode: true,
    status: 'LISTED',
    fileName: 'zk_identity_vault.zip',
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    commitments: []
  },
  {
    id: 'p9',
    ownerId: 'user-2',
    owner: FALLBACK_PERSONAS[1],
    title: 'Offline Peer-to-Peer Mesh Communicator',
    description: 'Disaster-zone messaging application communicating directly over Bluetooth Low Energy and Wi-Fi Direct mesh without cell towers or internet. Gossip protocol tested; needs message persistence and AES-256 ratcheting UI.',
    category: 'Mobile',
    techTags: JSON.stringify(['Flutter', 'BLE', 'Libp2p', 'Dart', 'Crypto']),
    stakeRequired: 110,
    completion: 35,
    milestoneMode: true,
    status: 'LISTED',
    fileName: 'mesh_communicator.zip',
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    commitments: []
  },
  {
    id: 'p10',
    ownerId: 'user-1',
    owner: FALLBACK_PERSONAS[0],
    title: 'Git Repo Necromancy & Dependency Vulnerability Auditor',
    description: 'CLI toolkit that scans abandoned GitHub repositories, identifies critical CVEs, and automatically generates dependency upgrade PRs with green test builds. Core AST scanner works; needs Docker isolated sandbox execution.',
    category: 'DevTools',
    techTags: JSON.stringify(['Go', 'GitHub API', 'Docker', 'CLI', 'YAML']),
    stakeRequired: 90,
    completion: 80,
    milestoneMode: false,
    status: 'LISTED',
    fileName: 'git_necromancy_cli.zip',
    createdAt: new Date(Date.now() - 9 * 86400000).toISOString(),
    commitments: []
  },
  {
    id: 'p11',
    ownerId: 'user-3',
    owner: FALLBACK_PERSONAS[2],
    title: 'Autonomous Lawn Rover Vision & Obstacle Classifier',
    description: 'Computer vision stack for budget autonomous lawn care rovers using single monocular RGB camera. Semantic segmentation model trained in PyTorch; needs ROS2 navigation node bridge and edge quantization for Jetson Nano.',
    category: 'AI/ML',
    techTags: JSON.stringify(['Python', 'PyTorch', 'OpenCV', 'ROS2', 'CUDA']),
    stakeRequired: 150,
    completion: 60,
    milestoneMode: true,
    status: 'LISTED',
    fileName: 'lawn_rover_vision.zip',
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    commitments: []
  },
  {
    id: 'p12',
    ownerId: 'user-2',
    owner: FALLBACK_PERSONAS[1],
    title: 'Peer Tutoring Algorithmic Matcher',
    description: 'Algorithmic matching network for university peer study groups based on syllabus overlap, skill deficits, and mutual free calendar blocks. Matching algorithm done; needs messaging and rating feedback loop.',
    category: 'Web',
    techTags: JSON.stringify(['React', 'Node.js', 'PostgreSQL', 'Redis']),
    stakeRequired: 90,
    completion: 30,
    milestoneMode: false,
    status: 'LISTED',
    fileName: 'peer_tutoring_matcher.zip',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    commitments: []
  }
];

// One shared category list for submit, browse filters and districts.
export const CATEGORIES = ['Web', 'Mobile', 'AI/ML', 'IoT', 'DevTools', 'Education', 'Web3', 'Security', 'Game'];

const DISTRICTS = {
  Web: 'The Forgotten Web',
  Mobile: 'Mobile Sanctuary',
  'AI/ML': 'AI Catacombs',
  IoT: 'Hardware Crypt',
  DevTools: 'DevTools Vault',
  Education: 'Campus Graveyard',
  Web3: 'Cryptographic Catacombs',
  Security: 'Security Crypt',
  Game: 'Arcade Ruins'
};

export function districtFor(category) {
  return DISTRICTS[category] || 'The Forgotten Web';
}

const OPEN_LICENSES = ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'ISC', 'Unlicense',
  'MPL-2.0', 'LGPL-2.1', 'LGPL-3.0', 'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'CC0-1.0', 'Zlib', 'BSL-1.0'];

export function timeAgo(value) {
  if (!value) return 'unknown';
  const days = Math.max(0, (Date.now() - new Date(value).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days < 45) return `${Math.round(days)} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

// Deterministic short fingerprint for a provenance event (same input -> same hash).
function fingerprint(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x5bd1e995) >>> 0;
  }
  return '0x' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Works out *why* a project died from its real history, not just that it did.
// Archiving is the outcome, not the cause, so it is a tag rather than a diagnosis.
export function diagnoseDecline(project) {
  if (!project.githubAnalyzedAt) return null;
  const year = 365 * 86400000;
  const timeline = parseJson(project.githubActivity, []).filter(item => item.period !== 'Now');
  const lastCommit = project.githubLastCommitAt ? new Date(project.githubLastCommitAt).getTime() : null;
  const leadLastSeen = project.githubMaintainerLastSeen ? new Date(project.githubMaintainerLastSeen).getTime() : null;
  const openIssues = project.githubOpenIssues ?? 0;
  const closedIssues = project.githubClosedIssues ?? 0;

  if (project.githubTopMaintainer && leadLastSeen && lastCommit && lastCommit - leadLastSeen > year) {
    const years = Math.round((lastCommit - leadLastSeen) / year);
    return {
      cause: 'Maintainer Departure',
      explanation: `The lead contributor @${project.githubTopMaintainer} stopped committing about ${years} year${years === 1 ? '' : 's'} before the last commit; others kept it going for a while, then it stalled.`
    };
  }
  if ((project.githubContributors ?? 0) <= 1) {
    return {
      cause: 'Solo Maintainer Burnout',
      explanation: 'Almost all recent work came from one person, so when they stopped, the project stopped.'
    };
  }
  if (openIssues > 20 && openIssues > closedIssues * 0.5) {
    return {
      cause: 'Overwhelmed by Issues',
      explanation: `${openIssues} issues are still open against ${closedIssues} closed: demand outgrew the people answering it.`
    };
  }
  if (timeline.length >= 3) {
    const peakIndex = timeline.reduce((best, item, i) => (item.commits > timeline[best].commits ? i : best), 0);
    const peak = timeline[peakIndex].commits || 1;
    const last = timeline[timeline.length - 1].commits;
    const after = timeline.length - 1 - peakIndex;
    if (after <= 1 && last >= peak * 0.25) {
      return {
        cause: 'Abrupt Stop',
        explanation: 'Activity was near its peak right up until the commits stopped, which points to a decision (archived, replaced, or the team moved on), not slow decay.'
      };
    }
    if (after >= 2) {
      return {
        cause: 'Gradual Fade-out',
        explanation: `Activity peaked in ${timeline[peakIndex].period} and shrank over the next ${after} periods until it stopped.`
      };
    }
  }
  if ((project.githubStars ?? 0) < 10) {
    return { cause: 'Low Adoption', explanation: 'Few people found or used it, so there was little reason to keep going.' };
  }
  return { cause: 'Stalled Development', explanation: 'Commits slowed and then stopped without a clear single cause in the data.' };
}

function buildAutopsy(project) {
  if (!project.githubAnalyzedAt) return null;

  const daysSinceCommit = project.githubLastCommitAt
    ? (Date.now() - new Date(project.githubLastCommitAt).getTime()) / 86400000
    : null;
  const openIssues = project.githubOpenIssues ?? 0;
  const closedIssues = project.githubClosedIssues ?? 0;
  const readmeLength = project.githubReadmeLength ?? 0;

  const diagnosis = diagnoseDecline(project);
  const tags = [];
  if (project.githubArchived) tags.push('archived-by-owner');
  if (project.githubContributors !== null && project.githubContributors <= 1) tags.push('single-maintainer');
  if (diagnosis?.cause === 'Maintainer Departure') tags.push('maintainer-left');
  if (openIssues > closedIssues && openIssues > 5) tags.push('issue-backlog');
  if (readmeLength < 300) tags.push('documentation-debt');
  if ((project.githubStars ?? 0) < 10) tags.push('low-adoption');
  if (daysSinceCommit !== null && daysSinceCommit > 3 * 365) tags.push('stale-dependencies');

  const facts = [];
  if (project.githubLastCommitAt) facts.push(`Last commit ${timeAgo(project.githubLastCommitAt)}.`);
  if (project.githubTopMaintainer) {
    facts.push(`Top contributor @${project.githubTopMaintainer}` +
      (project.githubMaintainerLastSeen ? ` last committed ${timeAgo(project.githubMaintainerLastSeen)}.` : '.'));
  }
  facts.push(`${openIssues} open vs ${closedIssues} closed issues.`);
  if (project.githubStars !== null) facts.push(`${project.githubStars} stars, ${project.githubForks ?? 0} forks.`);
  facts.push(project.githubArchived ? 'The owner archived the repository (read-only).' : 'Repository is not archived.');

  const path = [];
  if (project.githubArchived) path.push('Fork it: the original is read-only, so the revival lives in your fork.');
  if (daysSinceCommit !== null && daysSinceCommit > 2 * 365) {
    path.push(`Upgrade dependencies first; they have not been touched in about ${Math.round(daysSinceCommit / 365)} years.`);
  }
  if (openIssues > 0) path.push(`Triage the ${openIssues} open issues; they are a ready-made backlog of what users wanted.`);
  if (readmeLength < 300) path.push('Write a proper README so the next person is not stuck where you were.');
  if (path.length === 0) path.push('Get it building again, then ship one small improvement to prove it is alive.');

  let timeline = parseJson(project.githubActivity, []);
  if (timeline.length > 0 && daysSinceCommit !== null && daysSinceCommit > 365) {
    timeline = [...timeline, { period: 'Now', commits: 0, contributors: 0 }];
  }

  const ownerNote = project.handoffNote
    ? project.handoffNote
    : project.source === 'OPEN_GRAVE'
      ? `No handoff letter: this project was found abandoned in public. Credit belongs to the original author${project.githubRepoOwner ? `, @${project.githubRepoOwner}` : ''}.`
      : 'The owner has not written a handoff letter yet.';

  return {
    peakPeriod: project.peakActivityMonth
      ? `${project.peakActivityMonth} (${project.peakActivityCommits ?? 0} commits)`
      : 'Unavailable',
    declinePattern: diagnosis?.cause || 'Unknown',
    ownerStatedReason: ownerNote,
    dataCorrelationNote: [diagnosis?.explanation, ...facts].filter(Boolean).join(' '),
    causeOfDeclineTags: tags,
    recommendedRevivalPath: path.join(' '),
    activityTimeline: timeline
  };
}

function buildProvenance(project) {
  const events = [];
  const add = (eventType, timestamp, actorName, actorRole, note) => {
    if (!timestamp) return;
    const iso = new Date(timestamp).toISOString();
    events.push({
      id: `prov_${project.id}_${events.length + 1}`,
      hash: fingerprint(`${project.id}|${eventType}|${iso}|${actorName}`),
      timestamp: iso,
      eventType,
      actorName,
      actorRole,
      note
    });
  };

  if (project.githubCreatedAt) {
    add('created', project.githubCreatedAt, project.githubRepoOwner ? `@${project.githubRepoOwner}` : 'Original author',
      'Original Author', 'Repository created on GitHub.');
  }
  if (project.githubTopMaintainer && project.githubMaintainerLastSeen) {
    add('decline', project.githubMaintainerLastSeen, `@${project.githubTopMaintainer}`, 'Top Maintainer',
      'Last week the main contributor committed code.');
  }
  add('listed', project.createdAt, project.owner?.alias || 'Curator',
    project.source === 'OPEN_GRAVE' ? 'Curator' : 'Verified Owner',
    project.source === 'OPEN_GRAVE'
      ? 'Discovered as abandoned with an open license and added to the graveyard.'
      : 'Listed by its verified owner for revival.');
  (project.commitments || []).forEach(commitment => {
    add('claimed', commitment.committedAt, commitment.taker?.alias || 'Reviver', 'Reviver', 'Claimed the project to revive it.');
    if (commitment.status === 'COMPLETED') {
      add('revived', commitment.resolvedAt, commitment.taker?.alias || 'Reviver', 'Reviver',
        commitment.submissionUrl ? `Revival verified: ${commitment.submissionUrl}` : 'Revival verified.');
    }
  });

  return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// Turns a database row into what the UI shows. Everything here is derived from
// stored data; nothing is invented. Unanalyzed projects show "not analyzed yet".
export function enrichProject(project, index = 0) {
  if (project.autopsyReport && project.provenance) return project; // already enriched (static demo data)

  const analyzed = Boolean(project.githubAnalyzedAt);
  const storedScore = typeof project.revivalScore === 'number' ? project.revivalScore : project.revivalScore?.overallScore;
  const score = analyzed ? storedScore ?? null : null;
  const effort = project.autopsyDifficulty === 'Hard' ? 80
    : project.autopsyDifficulty === 'Medium' ? 50
    : project.autopsyDifficulty === 'Easy' ? 25
    : 100 - (project.completion ?? 50);
  const license = project.githubLicense || null;
  const lastActivity = project.githubLastCommitAt || project.updatedAt || project.createdAt;
  const openIssues = project.githubOpenIssues ?? 0;
  const closedIssues = project.githubClosedIssues ?? 0;

  return {
    ...project,
    district: districtFor(project.category),
    license: license || 'No license',
    isForkFriendly: OPEN_LICENSES.includes(license),
    hasTornCorner: index % 2 === 0,
    lastActiveRecency: timeAgo(lastActivity),
    quadrantCoordinates: { effort, potential: score ?? 50 },
    revivalScore: {
      overallScore: score,
      codeHealthScore: analyzed ? Math.round(openIssues + closedIssues === 0 ? 70 : (closedIssues / (openIssues + closedIssues)) * 100) : null,
      docQualityScore: analyzed ? Math.min(100, Math.round((project.githubReadmeLength ?? 0) / 30)) : null,
      effortEstimate: effort < 35 ? 'Surface Dig' : effort < 65 ? 'Moderate Excavation' : 'Deep Excavation'
    },
    githubIntelligence: project.githubAnalyzedAt ? {
      score: project.revivalScore,
      status: project.autopsyStatus,
      cause: diagnoseDecline(project)?.cause || project.autopsyCause,
      lastActivity: project.autopsyLastActivity,
      difficulty: project.autopsyDifficulty,
      peakMonth: project.peakActivityMonth,
      peakCommits: project.peakActivityCommits,
      peakContributors: project.peakActivityContributors,
      peakPullRequests: project.peakActivityPullRequests,
      analyzedAt: project.githubAnalyzedAt,
      repository: {
        name: project.githubRepoName,
        owner: project.githubRepoOwner,
        description: project.githubDescription,
        defaultBranch: project.githubDefaultBranch,
        license: project.githubLicense,
        totalCommits: project.githubTotalCommits,
        commitFrequency: project.githubCommitFrequency,
        lastCommitAt: project.githubLastCommitAt,
        contributors: project.githubContributors,
        openIssues: project.githubOpenIssues,
        closedIssues: project.githubClosedIssues,
        pullRequests: project.githubPullRequests,
        releases: project.githubReleases,
        stars: project.githubStars,
        forks: project.githubForks,
        watchers: project.githubWatchers,
        readmeExists: project.githubReadmeExists,
        readmeLength: project.githubReadmeLength
      }
    } : null,
    autopsyReport: buildAutopsy(project),
    provenance: buildProvenance(project)
  };
}

// Client-side storage helpers for static / GitHub Pages demo mode
export function getLocalProjects() {
  if (!STATIC_DEMO) return [];
  let list = FALLBACK_PROJECTS;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('graveyard_demo_projects');
      if (raw) list = JSON.parse(raw);
    } catch (e) {}
  }
  return list.map((p, idx) => enrichProject(p, idx));
}

export function saveLocalProjects(projects) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('graveyard_demo_projects', JSON.stringify(projects));
  } catch (e) {}
}

export function getLocalPersonas() {
  if (!STATIC_DEMO) return [];
  if (typeof window === 'undefined') return FALLBACK_PERSONAS;
  try {
    const raw = localStorage.getItem('graveyard_demo_personas');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return FALLBACK_PERSONAS;
}

export function saveLocalPersonas(personas) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('graveyard_demo_personas', JSON.stringify(personas));
  } catch (e) {}
}

