import { isOpenLicense } from './githubIntelligence';
import { CATEGORIES } from './mockFallback';
import { CLAIM_DAY_OPTIONS, DEFAULT_CLAIM_DAYS, TIME_ESTIMATES } from './claimRules';

// The one rule for what the platform may list (used by the full form and the quick suggest box):
//  - you own the repo (your linked GitHub login is the repo owner)       -> DONATED
//  - or it is abandoned AND its license already allows anyone to fork it -> OPEN_GRAVE
export function classifyRepoForListing(repo, githubUsername) {
  const isOwner = Boolean(githubUsername) && repo.owner?.login?.toLowerCase() === githubUsername.toLowerCase();
  const monthsInactive = (Date.now() - new Date(repo.pushed_at).getTime()) / (30 * 86400000);
  const abandoned = Boolean(repo.archived) || monthsInactive >= 12;
  const openLicense = isOpenLicense(repo.license?.spdx_id);

  if (isOwner) return { ok: true, source: 'DONATED', abandoned, openLicense, isOwner };
  if (abandoned && openLicense) return { ok: true, source: 'OPEN_GRAVE', abandoned, openLicense, isOwner };

  const reasons = [];
  if (!openLicense) reasons.push(`it has no open-source license that allows forking (${repo.license?.spdx_id || 'none'}), so only its owner can list it`);
  if (!abandoned) {
    const months = Math.max(0, Math.floor(monthsInactive));
    reasons.push(`it is still maintained (last push ${months === 0 ? 'this month' : `${months} month${months === 1 ? '' : 's'} ago`}; it needs 12+ months of silence or to be archived)`);
  }
  return { ok: false, abandoned, openLicense, isOwner, reasons };
}

// Best-effort category from GitHub topics and language, so a suggestion needs only a URL.
const TOPIC_RULES = [
  ['AI/ML', ['machine-learning', 'deep-learning', 'tensorflow', 'pytorch', 'ai', 'ml', 'neural-network', 'nlp', 'llm', 'computer-vision']],
  ['Security', ['security', 'pentest', 'osint', 'infosec', 'hacking', 'cryptography', 'vulnerability', 'ctf']],
  ['Game', ['game', 'games', 'gamedev', 'game-engine', 'unity', 'godot', 'phaser']],
  ['Web3', ['blockchain', 'ethereum', 'web3', 'solidity', 'crypto', 'bitcoin', 'nft']],
  ['IoT', ['iot', 'arduino', 'raspberry-pi', 'esp32', 'embedded', 'hardware', 'firmware']],
  ['Mobile', ['android', 'ios', 'mobile', 'react-native', 'flutter', 'swiftui']],
  ['Education', ['education', 'tutorial', 'learning', 'course', 'interview', 'exercises', 'koans']],
  ['DevTools', ['cli', 'devtools', 'developer-tools', 'terminal', 'linter', 'compiler', 'build-tool', 'editor']]
];
const LANGUAGE_RULES = { Swift: 'Mobile', Kotlin: 'Mobile', 'Objective-C': 'Mobile', Dart: 'Mobile', Solidity: 'Web3', 'Jupyter Notebook': 'AI/ML', GDScript: 'Game' };

export function guessCategory(repo) {
  const topics = (repo.topics || []).map(t => t.toLowerCase());
  for (const [category, words] of TOPIC_RULES) {
    if (topics.some(t => words.includes(t))) return category;
  }
  const byLanguage = LANGUAGE_RULES[repo.language];
  if (byLanguage) return byLanguage;
  return CATEGORIES.includes('Web') ? 'Web' : CATEGORIES[0];
}

// Everything a claimer needs before pledging, checked on the server (never trust the form).
// Returns { data } ready for prisma.project.create, or { error }.
export function validateListingDetails(body = {}, source) {
  const text = (v, max) => String(v ?? '').trim().slice(0, max);
  const title = text(body.title, 120);
  const description = text(body.description, 5000);
  const doneWhen = text(body.doneWhen, 600);
  if (!title) return { error: 'A title is required.' };
  if (description.length < 20) return { error: 'Describe the project in at least 20 characters: what works and what is broken.' };
  if (doneWhen.length < 15) return { error: 'Say what "revived" means for this project (at least 15 characters), so claimers know when they are done.' };

  const category = body.category === 'Cybersecurity' ? 'Security' : body.category;
  if (!CATEGORIES.includes(category)) return { error: `Category must be one of: ${CATEGORIES.join(', ')}.` };

  let tags = body.techTags;
  if (typeof tags === 'string') {
    try { tags = JSON.parse(tags); } catch { tags = tags.split(','); }
  }
  tags = (Array.isArray(tags) ? tags : []).map(t => text(t, 30)).filter(Boolean).slice(0, 10);

  const claimDays = Number(body.claimDays ?? DEFAULT_CLAIM_DAYS);
  if (!CLAIM_DAY_OPTIONS.includes(claimDays)) return { error: `Claim length must be ${CLAIM_DAY_OPTIONS.join(', ')} days.` };

  const timeEstimate = body.timeEstimate ? String(body.timeEstimate) : null;
  if (timeEstimate && !TIME_ESTIMATES[timeEstimate]) return { error: 'Pick a time estimate from the list.' };

  const completion = Math.round(Number(body.completion ?? 0));
  if (!Number.isFinite(completion) || completion < 0 || completion > 100) return { error: 'Completion must be between 0 and 100.' };

  return {
    data: {
      title,
      description,
      doneWhen,
      starterTasks: text(body.starterTasks, 1500) || null,
      timeEstimate,
      claimDays,
      category,
      techTags: JSON.stringify(tags),
      completion,
      handoffNote: text(body.handoffNote, 4000) || null,
      ownerAvailable: source === 'DONATED' && Boolean(body.ownerAvailable)
    }
  };
}
