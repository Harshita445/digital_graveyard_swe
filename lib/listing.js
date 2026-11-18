import { isOpenLicense } from './githubIntelligence';
import { CATEGORIES } from './mockFallback';

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
