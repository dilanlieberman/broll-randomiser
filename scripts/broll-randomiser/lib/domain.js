'use strict';

// Classify a clip's service domain (roofing vs remodeling) so a roofing reel
// only pulls roofing b-roll — no interior kitchens, no silo demolition, no
// generic-action junk-drawer. Pure; derived from existing tags + setting, so no
// re-ingest needed. Spec §5.3 domain gate.

// NOTE: storm-damage is deliberately NOT here — it's cross-domain (tree removal,
// interior water damage, generic storm cleanup all carry it). A storm-damaged ROOF
// clip qualifies via setting=roof or roof-inspection/roof-teardown instead.
// Residential roofing only. `flat-roof-membrane` (gravel-ballasted/TPO flat roofs)
// is commercial — a homeowner can't relate to it — so it is deliberately NOT a
// roofing signal. `metal-roof-install` stays a roofing tag for classification, but
// every metal-roof clip is exclude:true at the catalog level (damaged "fell through
// the roof" source), so none actually reach a reel.
const ROOFING_TAGS = new Set([
  'roof-teardown', 'shingle-install', 'ridge-cap', 'valley-work', 'flashing',
  'gutter-work', 'roof-inspection', 'roof-walkthrough', 'roof-aerial', 'roofing-crew',
  'roofing-underlayment', 'roof-repair-sealant', 'metal-roof-install',
]);

const REMODELING_TAGS = new Set([
  'bathroom-remodel', 'shower-tiling', 'floor-tiling', 'wall-tiling', 'attic-remodel',
  'kitchen-remodel', 'pergola-outdoor', 'interior-demo-gutting', 'finished-interior-reveal',
  'painting', 'drywall', 'tile-transition-strip', 'tile-leveling-system',
]);

// Building/structure demolition — its own thing, never roofing even if a roofing
// crew or storm-damage tag rides along (a silo coming down is not roof b-roll).
const DEMOLITION_TAGS = new Set(['silo-demolition', 'house-demolition']);

// Commercial roofing — gravel-ballasted/TPO flat roofs. A homeowner can't relate
// to it, so it is DISQUALIFIED from residential roofing even though it's shot on a
// roof (setting=roof would otherwise let it through). Operator: residential only.
const COMMERCIAL_TAGS = new Set(['flat-roof-membrane']);

function hasAny(tags, set) {
  return (tags || []).some((t) => set.has(t));
}

// Strict membership: a clip is "in" a domain only via explicit domain signals —
// a roofing tag or a roof setting for roofing; a remodeling tag or interior
// setting for remodeling. Neutral clips (bare exteriors, demolition, generic-only)
// belong to NO domain and are excluded from a domain-gated reel.
function clipMatchesDomain(clip, domain) {
  if (domain === 'roofing') {
    if (clip.setting === 'interior') return false; // a roof is never shot indoors
    if (hasAny(clip.tags, DEMOLITION_TAGS)) return false; // silos/houses coming down aren't roofing
    if (hasAny(clip.tags, COMMERCIAL_TAGS)) return false; // commercial flat roofs aren't residential roofing
    return clip.setting === 'roof' || hasAny(clip.tags, ROOFING_TAGS);
  }
  if (domain === 'remodeling') {
    if (clip.setting === 'roof') return false;
    // Any roofing signal disqualifies — even mistagged setting=interior roof clips
    // (some carry a stray finished-interior-reveal tag).
    if (hasAny(clip.tags, ROOFING_TAGS)) return false;
    return clip.setting === 'interior' || hasAny(clip.tags, REMODELING_TAGS);
  }
  return false;
}

function clipDomain(clip) {
  if (clipMatchesDomain(clip, 'roofing')) return 'roofing';
  if (clipMatchesDomain(clip, 'remodeling')) return 'remodeling';
  return 'other';
}

// Finer than domain: gate to a specific service so a "bathroom ad" doesn't pull
// kitchens, decks, pergolas, or anything outdoor. Bathrooms/kitchens are interior.
const SERVICE_EXCLUDE = {
  bathroom: new Set(['kitchen-remodel', 'pergola-outdoor', 'deck-board-install', 'attic-remodel']),
  kitchen: new Set(['bathroom-remodel', 'shower-tiling', 'pergola-outdoor', 'deck-board-install', 'attic-remodel']),
};

// A clip must carry a POSITIVE signal for the service — otherwise generic interior
// clips (walk-in closets, drywall, loose floor-tiling, bathroom reveals) flood a
// kitchen ad. Kitchen = the kitchen-remodel tag. (Bathroom stays broad for now.)
const SERVICE_REQUIRE = {
  kitchen: new Set(['kitchen-remodel']),
};

function clipMatchesService(clip, service) {
  if (service === 'roofing') return clipMatchesDomain(clip, 'roofing');
  if (service === 'bathroom' || service === 'kitchen') {
    if (!clipMatchesDomain(clip, 'remodeling')) return false;
    if (clip.setting === 'exterior') return false; // interiors only
    if ((clip.tags || []).some((t) => SERVICE_EXCLUDE[service].has(t))) return false;
    const req = SERVICE_REQUIRE[service];
    if (req && !(clip.tags || []).some((t) => req.has(t))) return false;
    return true;
  }
  // generic 'remodeling' or unknown → fall back to the broad remodeling domain
  return clipMatchesDomain(clip, 'remodeling');
}

module.exports = { clipMatchesDomain, clipMatchesService, clipDomain, ROOFING_TAGS, REMODELING_TAGS };
