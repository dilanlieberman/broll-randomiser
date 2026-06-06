'use strict';

// Classify a clip's service domain (roofing vs remodeling) so a roofing reel
// only pulls roofing b-roll — no interior kitchens, no silo demolition, no
// generic-action junk-drawer. Pure; derived from existing tags + setting, so no
// re-ingest needed. Spec §5.3 domain gate.

const ROOFING_TAGS = new Set([
  'roof-teardown', 'shingle-install', 'ridge-cap', 'valley-work', 'flashing',
  'gutter-work', 'roof-inspection', 'roof-walkthrough', 'roof-aerial', 'roofing-crew',
  'roofing-underlayment', 'storm-damage', 'roof-repair-sealant',
]);

const REMODELING_TAGS = new Set([
  'bathroom-remodel', 'shower-tiling', 'floor-tiling', 'wall-tiling', 'attic-remodel',
  'kitchen-remodel', 'pergola-outdoor', 'interior-demo-gutting', 'finished-interior-reveal',
  'painting', 'drywall', 'tile-transition-strip', 'tile-leveling-system',
]);

function hasAny(tags, set) {
  return (tags || []).some((t) => set.has(t));
}

// Strict membership: a clip is "in" a domain only via explicit domain signals —
// a roofing tag or a roof setting for roofing; a remodeling tag or interior
// setting for remodeling. Neutral clips (bare exteriors, demolition, generic-only)
// belong to NO domain and are excluded from a domain-gated reel.
function clipMatchesDomain(clip, domain) {
  if (domain === 'roofing') return clip.setting === 'roof' || hasAny(clip.tags, ROOFING_TAGS);
  if (domain === 'remodeling') {
    if (hasAny(clip.tags, ROOFING_TAGS) || clip.setting === 'roof') return false;
    return clip.setting === 'interior' || hasAny(clip.tags, REMODELING_TAGS);
  }
  return false;
}

function clipDomain(clip) {
  if (clipMatchesDomain(clip, 'roofing')) return 'roofing';
  if (clipMatchesDomain(clip, 'remodeling')) return 'remodeling';
  return 'other';
}

module.exports = { clipMatchesDomain, clipDomain, ROOFING_TAGS, REMODELING_TAGS };
