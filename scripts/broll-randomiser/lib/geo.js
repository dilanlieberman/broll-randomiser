'use strict';

// Map a client's US state to the clip `scenery` classes that look plausibly
// filmed there, so the matcher won't drop Cali palms into a New Jersey reel
// (or vice-versa). Pure. Spec §5.3 region gate.
//
// 'indeterminate' clips (roof+sky / interior, no placeable cues) are usable
// anywhere in LOOSE mode; STRICT mode requires a positive region match and so
// drops them too.

const NAME_TO_ABBR = {
  'new jersey': 'NJ', 'new york': 'NY', pennsylvania: 'PA', massachusetts: 'MA',
  connecticut: 'CT', 'rhode island': 'RI', ohio: 'OH', michigan: 'MI', illinois: 'IL',
  washington: 'WA', oregon: 'OR', virginia: 'VA', maryland: 'MD', 'north carolina': 'NC',
  tennessee: 'TN', indiana: 'IN', missouri: 'MO', 'new hampshire': 'NH',
  alaska: 'AK', minnesota: 'MN', maine: 'ME', vermont: 'VT', wisconsin: 'WI',
  montana: 'MT', colorado: 'CO', idaho: 'ID', 'north dakota': 'ND', 'south dakota': 'SD',
  arizona: 'AZ', nevada: 'NV', 'new mexico': 'NM', utah: 'UT', texas: 'TX', oklahoma: 'OK',
  florida: 'FL', hawaii: 'HI', california: 'CA', louisiana: 'LA', georgia: 'GA', 'south carolina': 'SC',
};

// Per-state plausible scenery (besides 'indeterminate', handled separately).
const STATE_SCENERY = {
  NJ: ['temperate'], NY: ['temperate'], PA: ['temperate'], MA: ['temperate'], CT: ['temperate'],
  RI: ['temperate'], OH: ['temperate'], MI: ['temperate'], IL: ['temperate'], WA: ['temperate'],
  OR: ['temperate'], VA: ['temperate'], MD: ['temperate'], NC: ['temperate'], TN: ['temperate'],
  IN: ['temperate'], MO: ['temperate'], NH: ['temperate'],
  AK: ['snowy', 'temperate'], MN: ['snowy', 'temperate'], ME: ['snowy', 'temperate'],
  VT: ['snowy', 'temperate'], WI: ['snowy', 'temperate'], MT: ['snowy', 'temperate'],
  CO: ['snowy', 'temperate'], ID: ['snowy', 'temperate'], ND: ['snowy', 'temperate'], SD: ['snowy', 'temperate'],
  AZ: ['arid'], NV: ['arid'], NM: ['arid'], UT: ['arid', 'snowy'], TX: ['arid', 'temperate'], OK: ['arid', 'temperate'],
  FL: ['tropical-coastal'], HI: ['tropical-coastal'], CA: ['tropical-coastal', 'arid', 'temperate'],
  LA: ['tropical-coastal', 'temperate'], GA: ['temperate', 'tropical-coastal'], SC: ['temperate', 'tropical-coastal'],
};

const DEFAULT_SCENERY = ['temperate'];

function normalizeState(state) {
  const s = String(state || '').trim().toLowerCase();
  if (s.length === 2) return s.toUpperCase();
  return NAME_TO_ABBR[s] || s.toUpperCase();
}

function sceneryAllowedForState(state, { strict = false } = {}) {
  const abbr = normalizeState(state);
  const base = STATE_SCENERY[abbr] || DEFAULT_SCENERY;
  const allowed = new Set(base);
  if (!strict) allowed.add('indeterminate');
  return allowed;
}

function clipEligibleForState(clip, state, opts = {}) {
  return sceneryAllowedForState(state, opts).has(clip.scenery);
}

module.exports = { sceneryAllowedForState, clipEligibleForState, STATE_SCENERY };
