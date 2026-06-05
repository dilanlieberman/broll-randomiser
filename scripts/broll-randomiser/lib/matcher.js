'use strict';

// Match a b-roll clip to each window. Pure + seeded so a run is reproducible and
// re-seeding reshuffles. Applies the Phase-1-discovered refinements: exclude junk
// (brand title cards, weak quality, novelty), cap pieces per source file, no
// in-reel repeats, theme → generic-action fallback, prefer good over usable.
// Spec §5.3.

const DEFAULT_EXCLUDE_TAGS = ['brand-title-card', 'bigfoot-parody'];
const DEFAULT_EXCLUDE_QUALITY = ['weak'];
const FALLBACK_THEME = 'generic-action';

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
  } = opts;

  const excludeTagSet = new Set(excludeTags);
  const eligible = catalog.filter(
    (c) => !c.tags.some((t) => excludeTagSet.has(t)) && !excludeQuality.includes(c.quality)
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

  return windows.map((w) => {
    let chosen = pick(poolFor(w.theme));
    if (!chosen && w.theme !== FALLBACK_THEME) chosen = pick(poolFor(FALLBACK_THEME));
    if (!chosen) chosen = pick(eligible.filter((c) => !usedIds.has(c.id) && (srcCount[c.src_file] || 0) < perSourceCap));
    if (chosen) {
      usedIds.add(chosen.id);
      srcCount[chosen.src_file] = (srcCount[chosen.src_file] || 0) + 1;
    }
    return chosen;
  });
}

module.exports = { matchClips, DEFAULT_EXCLUDE_TAGS, DEFAULT_EXCLUDE_QUALITY };
