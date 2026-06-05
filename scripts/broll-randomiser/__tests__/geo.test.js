const { sceneryAllowedForState, clipEligibleForState } = require('../lib/geo');

describe('sceneryAllowedForState', () => {
  test('New Jersey (loose): temperate + indeterminate, but not arid/tropical/snowy', () => {
    const allowed = sceneryAllowedForState('New Jersey', { strict: false });
    expect(allowed.has('temperate')).toBe(true);
    expect(allowed.has('indeterminate')).toBe(true);
    expect(allowed.has('arid')).toBe(false);
    expect(allowed.has('tropical-coastal')).toBe(false);
    expect(allowed.has('snowy')).toBe(false);
  });

  test('Alaska (loose): snowy is allowed', () => {
    expect(sceneryAllowedForState('Alaska', { strict: false }).has('snowy')).toBe(true);
  });

  test('California (loose): tropical-coastal and arid allowed', () => {
    const a = sceneryAllowedForState('California', { strict: false });
    expect(a.has('tropical-coastal')).toBe(true);
    expect(a.has('arid')).toBe(true);
  });

  test('accepts 2-letter abbreviations', () => {
    expect(sceneryAllowedForState('NJ', { strict: false }).has('temperate')).toBe(true);
  });

  test('strict mode drops indeterminate (positive region match required)', () => {
    expect(sceneryAllowedForState('New Jersey', { strict: true }).has('indeterminate')).toBe(false);
    expect(sceneryAllowedForState('New Jersey', { strict: true }).has('temperate')).toBe(true);
  });

  test('unknown state defaults to temperate + indeterminate', () => {
    const a = sceneryAllowedForState('Atlantis', { strict: false });
    expect(a.has('temperate')).toBe(true);
    expect(a.has('indeterminate')).toBe(true);
  });
});

describe('clipEligibleForState', () => {
  const nj = (scenery) => clipEligibleForState({ scenery }, 'New Jersey', { strict: false });

  test('a snowy clip is wrong for New Jersey', () => {
    expect(nj('snowy')).toBe(false);
  });
  test('a temperate clip fits New Jersey', () => {
    expect(nj('temperate')).toBe(true);
  });
  test('an indeterminate clip is usable in New Jersey (loose)', () => {
    expect(nj('indeterminate')).toBe(true);
  });
  test('an indeterminate clip is NOT usable in New Jersey under strict', () => {
    expect(clipEligibleForState({ scenery: 'indeterminate' }, 'New Jersey', { strict: true })).toBe(false);
  });
  test('a palm/tropical clip fits California but not New Jersey', () => {
    expect(clipEligibleForState({ scenery: 'tropical-coastal' }, 'California', { strict: false })).toBe(true);
    expect(nj('tropical-coastal')).toBe(false);
  });
});
