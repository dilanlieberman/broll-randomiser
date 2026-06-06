'use strict';

// Parse a Discord b-roll request like "roofing ad NJ" or "bathroom ad New York"
// into { service, domain, state }. Pure. Spec §6.
//   service word → domain (roofing → roofing; bath/kitchen/etc → remodeling)
//   state → everything after "ad" (or after the service word if "ad" is omitted)

const SERVICE_DOMAIN = {
  roofing: 'roofing', roof: 'roofing',
  bathroom: 'remodeling', kitchen: 'remodeling', remodel: 'remodeling',
  remodeling: 'remodeling', tiling: 'remodeling', tile: 'remodeling',
  deck: 'remodeling', pergola: 'remodeling', interior: 'remodeling',
};

function parseCommand(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  const tokens = raw.split(/\s+/);
  const lower = tokens.map((t) => t.toLowerCase());
  const service = lower[0];
  const domain = SERVICE_DOMAIN[service] || null;

  const adIdx = lower.indexOf('ad');
  let stateTokens;
  if (adIdx >= 0) stateTokens = tokens.slice(adIdx + 1);
  else stateTokens = tokens.slice(1); // no "ad" keyword → state follows the service
  const state = stateTokens.length ? stateTokens.join(' ') : null;

  return { service, domain, state };
}

module.exports = { parseCommand, SERVICE_DOMAIN };
