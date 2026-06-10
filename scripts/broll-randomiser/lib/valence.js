'use strict';

// Emotional valence of a clip, so the matcher can contrast-edit: run-down/demo
// footage under "the problem / the competitor", finished/beautiful footage under
// "us / the result". Pure; derived from existing tags (no re-ingest). The user's
// rule: "good clips when we talk about ourselves, run-down clips for competitors."

// Result / money shots — the dream outcome.
const AESTHETIC_TAGS = new Set([
  'finished-interior-reveal', 'before-after', 'roof-aerial', 'establishing-exterior',
]);

// The pain — run-down, demo, damage, teardown. What you show while naming the problem.
const PROBLEM_TAGS = new Set([
  'interior-demo-gutting', 'structure-teardown', 'water-damage-interior', 'storm-damage',
  'debris-haul', 'tile-removal-machine', 'tree-removal', 'roof-teardown', 'house-demolition',
  'silo-demolition', 'siding-removal',
]);

function hasAny(tags, set) {
  return (tags || []).some((t) => set.has(t));
}

// Precedence: aesthetic > problem > neutral. A before/after or finished reveal
// reads as the result even if it also shows some work.
function clipValence(clip) {
  if (hasAny(clip.tags, AESTHETIC_TAGS)) return 'aesthetic';
  if (hasAny(clip.tags, PROBLEM_TAGS)) return 'problem';
  return 'neutral';
}

// Does a clip fit a line's valence? Problem lines want problem footage; solution
// and neutral lines want aesthetic/neutral (never the downer footage) — aesthetic-led.
function valenceMatch(clip, lineValence) {
  const v = clipValence(clip);
  if (lineValence === 'problem') return v === 'problem';
  return v !== 'problem';
}

module.exports = { clipValence, valenceMatch, AESTHETIC_TAGS, PROBLEM_TAGS };
