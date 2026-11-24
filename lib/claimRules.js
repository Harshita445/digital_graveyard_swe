// The claim rules in one place. Pure constants, safe to import from pages and API routes.
//
// Why 500 starting credits: a pledge is 150, so a new member can hold up to 3 claims at once
// (450), and someone who disappears 3 times without finishing anything drops to 50 credits and
// can't claim again. Every finished revival returns the pledge plus a reward, so people who
// actually revive things keep growing. Credits can't be bought, sold or transferred.

export const STARTING_CREDITS = 500;
export const PLEDGE = 150;               // locked on claim, returned on finish or honest quit
export const REVIVE_REWARD = 100;        // credits for a verified revival
export const REVIVE_REP = 15;            // reputation for a verified revival
export const GHOST_REP = -10;            // reputation lost for disappearing (plus 1 strike; 3 strikes = no more claims)

export const PROOF_DAYS = 7;             // first own commit on a fork must appear within this
export const REQUEST_DAYS = 3;           // donated: owner must answer a claim request within this
export const CLAIM_DAY_OPTIONS = [14, 30, 60];
export const DEFAULT_CLAIM_DAYS = 30;
export const MIN_NEW_COMMITS = 3;        // commits after the claim needed to count as revived

export const TIME_ESTIMATES = {
  WEEKEND: 'A weekend',
  WEEKS: '1–2 weeks',
  MONTH_PLUS: 'A month or more'
};

export const DEFAULT_DONE_WHEN =
  'It builds and runs on today\'s tools, and the fork has real new commits on top of the original.';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function canAffordPledge(credits) {
  return Number(credits) >= PLEDGE;
}
