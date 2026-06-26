'use strict';

// Match a b-roll clip to each window. Pure + seeded so a run is reproducible and
// re-seeding reshuffles. Applies the Phase-1-discovered refinements: exclude junk
// (brand title cards, weak quality, novelty), cap pieces per source file, no
// in-reel repeats, theme → generic-action fallback, prefer good over usable.
// Spec §5.3.

const { clipEligibleForState } = require('./geo');
const { clipMatchesDomain, clipMatchesService } = require('./domain');
const { valenceMatch } = require('./valence');

const DEFAULT_EXCLUDE_TAGS = ['brand-title-card', 'bigfoot-parody'];
const DEFAULT_EXCLUDE_QUALITY = ['weak'];
const FALLBACK_THEME = 'generic-action';

// A reel must END on a good note — a finished/aspirational shot, never a teardown,
// damage, or demolition downer. (Operator: "always a good note.")
const CLOSING_POSITIVE = new Set([
  'roof-aerial', 'establishing-exterior', 'ridge-cap', 'before-after',
  'finished-interior-reveal',
]);
const CLOSING_NEGATIVE = new Set([
  'roof-teardown', 'storm-damage', 'debris-haul', 'structure-teardown',
  'silo-demolition', 'house-demolition', 'water-damage-interior', 'interior-demo-gutting',
  'roof-inspection',
]);

// "Satisfying" = guys on a roof doing clean, repetitive work (shingles going down,
// ridge caps, tiling) — the oddly-satisfying look the operator wants. Explicitly
// NOT drone/aerial fly-overs. Preferred over empty establishing shots.
const SATISFYING_TAGS = new Set([
  'shingle-install', 'ridge-cap', 'valley-work', 'roofing-underlayment', 'flashing',
  'gutter-work', 'roof-teardown', 'shower-tiling', 'floor-tiling', 'wall-tiling',
  'tile-leveling-system', 'tile-transition-strip',
]);
function isSatisfying(clip) {
  return clip.motion !== 'drone' && (clip.tags || []).some((t) => SATISFYING_TAGS.has(t));
}

// "Aesthetic" = the nice wide/cinematic half of the mix the operator wants
// interleaved with the satisfying close-ups — clean establishing shots, roof
// walkthroughs, and (gated) drone aerials. A reel should alternate aesthetic and
// satisfying rather than pour in close-ups only.
const AESTHETIC_TAGS = new Set(['establishing-exterior', 'roof-walkthrough', 'roof-aerial']);
function isAesthetic(clip) {
  return (clip.tags || []).some((t) => AESTHETIC_TAGS.has(t));
}
// Category drives the interleave: satisfying close-up vs aesthetic wide vs other.
function clipCategory(clip) {
  if (isSatisfying(clip)) return 'satisfying';
  if (isAesthetic(clip)) return 'aesthetic';
  return 'other';
}

// A drone aerial reveals geography (palms/snow/terrain) and property scale far
// more than a close-up, so it must be residential AND match the client's state.
// Operator: residential roofing only — "a hole in a commercial roof isn't" relatable.
// (Non-residential aerials — skyline, silos — are exclude:true / fail the domain gate.)
function isDroneAerial(clip) {
  return clip.motion === 'drone' || (clip.tags || []).includes('roof-aerial');
}

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
    perSourceCap = 1, // one clip per source video per reel — two pieces of the same
    //                   source read as "the same clip twice" even at different segments
    excludeTags = DEFAULT_EXCLUDE_TAGS,
    excludeQuality = DEFAULT_EXCLUDE_QUALITY,
    excludeHasText = true, // "pure content only" — no captions/watermarks/handles
    state = null, // client's US state; gates clip scenery to the region when set
    strict = false, // strict = require positive region match (drops indeterminate)
    domain = null, // 'roofing' | 'remodeling' — broad domain gate
    service = null, // 'roofing' | 'bathroom' | 'kitchen' — finer gate (preferred)
  } = opts;

  const excludeTagSet = new Set(excludeTags);
  const eligible = catalog.filter(
    (c) =>
      !c.exclude && // manually killed clips (e.g. photo-slideshows) — never use
      !c.tags.some((t) => excludeTagSet.has(t)) &&
      !excludeQuality.includes(c.quality) &&
      !(excludeHasText && c.has_text) &&
      (!state || clipEligibleForState(c, state, { strict })) &&
      // Drone aerials are residential-only and region-sensitive: require a state
      // AND a strict scenery match (even on loose runs). No state → no aerials.
      (!isDroneAerial(c) || (state && clipEligibleForState(c, state, { strict: true }))) &&
      (service ? clipMatchesService(c, service) : (!domain || clipMatchesDomain(c, domain)))
  );

  const rand = rng(seed);
  const usedIds = new Set();
  const srcCount = {};
  const domUsed = {}; // how many times each dominant shot-subject has been used
  const usedThemes = new Set(); // window themes already seen this reel
  let lastDominant = null; // dominant subject of the previous clip (no back-to-back repeats)
  let lastCategory = null; // satisfying|aesthetic|other of the previous clip (drives interleave)

  const dominant = (c) => (c.tags && c.tags[0]) || 'generic-action';
  const avail = (c) => !usedIds.has(c.id) && (srcCount[c.src_file] || 0) < perSourceCap;

  // Candidate clips for a theme under the live no-repeat + per-source-cap constraints.
  const poolFor = (theme) => eligible.filter((c) => c.tags.includes(theme) && avail(c));

  // Diversity-aware pick: minimize reuse of a shot-subject and never repeat the
  // previous clip's dominant subject back-to-back, so a reel looks unique.
  const pick = (pool) => {
    if (!pool.length) return null;
    const score = (c) => (domUsed[dominant(c)] || 0) + (dominant(c) === lastDominant ? 1000 : 0);
    const min = Math.min(...pool.map(score));
    const best = pool.filter((c) => score(c) === min);
    const good = best.filter((c) => c.quality === 'good');
    const tier = good.length ? good : best; // prefer good over usable
    // Interleave: prefer the category opposite the previous clip so aesthetic wides
    // and satisfying close-ups alternate (operator wants a mix of both, not close-ups
    // only). After a satisfying close-up, reach for an aesthetic wide; otherwise reach
    // for a satisfying close-up. Falls back to the satisfying-first preference, then
    // the whole tier — never starves.
    const wantCat = lastCategory === 'satisfying' ? 'aesthetic' : 'satisfying';
    const preferred = tier.filter((c) => clipCategory(c) === wantCat);
    let from;
    if (preferred.length) from = preferred;
    else { const sat = tier.filter(isSatisfying); from = sat.length ? sat : tier; }
    return from[Math.floor(rand() * from.length)];
  };

  return windows.map((w, idx) => {
    let chosen;
    if (idx === windows.length - 1) {
      // The closer: a good note wins over theme match. Finished/aspirational first,
      // then anything non-negative, then whatever's left.
      chosen = pick(eligible.filter((c) => avail(c) && isClosingWorthy(c)));
      if (!chosen) chosen = pick(eligible.filter((c) => avail(c) && !c.tags.some((t) => CLOSING_NEGATIVE.has(t))));
      if (!chosen) chosen = pick(eligible.filter(avail));
    } else {
      // Valence contrast: problem lines pull run-down/demo clips, us/result lines
      // pull aesthetic/neutral. Aesthetic-led, but never starve — fall back to
      // ignoring valence rather than producing no clip.
      const vOk = (c) => !w.valence || valenceMatch(c, w.valence);
      // First time a theme appears, match it to the line. When it repeats, broaden
      // to the whole eligible pool so pick() can diversify the shot-subject.
      const broaden = usedThemes.has(w.theme);
      usedThemes.add(w.theme);
      let pool = (broaden ? eligible.filter(avail) : poolFor(w.theme)).filter(vOk);
      if (!pool.length && w.theme !== FALLBACK_THEME) pool = poolFor(FALLBACK_THEME).filter(vOk);
      if (!pool.length) pool = eligible.filter((c) => avail(c) && vOk(c));
      if (!pool.length) pool = eligible.filter(avail); // last resort: any eligible
      chosen = pick(pool);
    }
    if (chosen) {
      usedIds.add(chosen.id);
      srcCount[chosen.src_file] = (srcCount[chosen.src_file] || 0) + 1;
      domUsed[dominant(chosen)] = (domUsed[dominant(chosen)] || 0) + 1;
      lastDominant = dominant(chosen);
      lastCategory = clipCategory(chosen);
    }
    return chosen;
  });
}

module.exports = { matchClips, isClosingWorthy, DEFAULT_EXCLUDE_TAGS, DEFAULT_EXCLUDE_QUALITY };
