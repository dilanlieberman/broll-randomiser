'use strict';

// Match a b-roll clip to each window. Pure + seeded so a run is reproducible and
// re-seeding reshuffles. Applies the Phase-1-discovered refinements: exclude junk
// (brand title cards, weak quality, novelty), cap pieces per source file, no
// in-reel repeats, theme → generic-action fallback, prefer good over usable.
// Spec §5.3.

const { clipEligibleForState } = require('./geo');
const { clipMatchesDomain } = require('./domain');

const DEFAULT_EXCLUDE_TAGS = ['brand-title-card', 'bigfoot-parody'];
const DEFAULT_EXCLUDE_QUALITY = ['weak'];
const FALLBACK_THEME = 'generic-action';

// A reel must END on a good note — a finished/aspirational shot, never a teardown,
// damage, or demolition downer. (Operator: "always a good note.")
const CLOSING_POSITIVE = new Set([
  'roof-aerial', 'establishing-exterior', 'ridge-cap', 'before-after',
  'finished-interior-reveal', 'metal-roof-install',
]);
const CLOSING_NEGATIVE = new Set([
  'roof-teardown', 'storm-damage', 'debris-haul', 'structure-teardown',
  'silo-demolition', 'house-demolition', 'water-damage-interior', 'interior-demo-gutting',
  'roof-inspection',
]);

function isClosingWorthy(clip) {
  return (
    clip.quality !== 'weak' &&
    (clip.tags || []).some((t) => CLOSING_POSITIVE.has(t)) &&
    !(clip.tags || []).some((t) => CLOSING_NEGATIVE.has(t))
  );
}

// mulberry32 — tiny deterministic PRNG so (seed) fully determines the sequence.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function matchClips(windows, catalog, opts = {}) {
  const {
    seed = 1,
    perSourceCap = 2,
    excludeTags = DEFAULT_EXCLUDE_TAGS,
    excludeQuality = DEFAULT_EXCLUDE_QUALITY,
    excludeHasText = true, // "pure content only" — no captions/watermarks/handles
    state = null, // client's US state; gates clip scenery to the region when set
    strict = false, // strict = require positive region match (drops indeterminate)
    domain = null, // 'roofing' | 'remodeling' — gates the reel to one service domain
  } = opts;

  const excludeTagSet = new Set(excludeTags);
  const eligible = catalog.filter(
    (c) =>
      !c.tags.some((t) => excludeTagSet.has(t)) &&
      !excludeQuality.includes(c.quality) &&
      !(excludeHasText && c.has_text) &&
      (!state || clipEligibleForState(c, state, { strict })) &&
      (!domain || clipMatchesDomain(c, domain))
  );

  const rand = rng(seed);
  const usedIds = new Set();
  const srcCount = {};

  // Candidate clips for a theme under the live no-repeat + per-source-cap constraints.
  const poolFor = (theme) =>
    eligible.filter(
      (c) => c.tags.includes(theme) && !usedIds.has(c.id) && (srcCount[c.src_file] || 0) < perSourceCap
    );

  const pick = (pool) => {
    if (!pool.length) return null;
    const good = pool.filter((c) => c.quality === 'good');
    const from = good.length ? good : pool; // prefer good over usable
    return from[Math.floor(rand() * from.length)];
  };

  const avail = (c) => !usedIds.has(c.id) && (srcCount[c.src_file] || 0) < perSourceCap;

  return windows.map((w, idx) => {
    let chosen;
    if (idx === windows.length - 1) {
      // The closer: a good note wins over theme match. Finished/aspirational first,
      // then anything non-negative, then whatever's left.
      chosen = pick(eligible.filter((c) => avail(c) && isClosingWorthy(c)));
      if (!chosen) chosen = pick(eligible.filter((c) => avail(c) && !c.tags.some((t) => CLOSING_NEGATIVE.has(t))));
      if (!chosen) chosen = pick(eligible.filter(avail));
    } else {
      chosen = pick(poolFor(w.theme));
      if (!chosen && w.theme !== FALLBACK_THEME) chosen = pick(poolFor(FALLBACK_THEME));
      if (!chosen) chosen = pick(eligible.filter(avail));
    }
    if (chosen) {
      usedIds.add(chosen.id);
      srcCount[chosen.src_file] = (srcCount[chosen.src_file] || 0) + 1;
    }
    return chosen;
  });
}

module.exports = { matchClips, isClosingWorthy, DEFAULT_EXCLUDE_TAGS, DEFAULT_EXCLUDE_QUALITY };
