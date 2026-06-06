const { clipMatchesDomain, clipDomain } = require('../lib/domain');

describe('clipMatchesDomain — roofing (strict)', () => {
  test('a clip with an explicit roofing tag matches roofing', () => {
    expect(clipMatchesDomain({ tags: ['roof-teardown', 'single-worker'], setting: 'roof' }, 'roofing')).toBe(true);
    expect(clipMatchesDomain({ tags: ['shingle-install'], setting: 'roof' }, 'roofing')).toBe(true);
  });

  test('a clip shot on a roof matches roofing even with only generic tags', () => {
    expect(clipMatchesDomain({ tags: ['generic-action'], setting: 'roof' }, 'roofing')).toBe(true);
  });

  test('an interior kitchen clip does NOT match roofing', () => {
    expect(clipMatchesDomain({ tags: ['kitchen-remodel', 'single-worker'], setting: 'interior' }, 'roofing')).toBe(false);
  });

  test('a silo/house demolition exterior with no roofing signal does NOT match roofing', () => {
    expect(clipMatchesDomain({ tags: ['silo-demolition', 'structure-teardown', 'generic-action'], setting: 'exterior' }, 'roofing')).toBe(false);
    expect(clipMatchesDomain({ tags: ['house-demolition', 'generic-action'], setting: 'exterior' }, 'roofing')).toBe(false);
  });

  test('a pure generic-action clip does NOT match roofing', () => {
    expect(clipMatchesDomain({ tags: ['generic-action'], setting: 'exterior' }, 'roofing')).toBe(false);
  });

  // Regression: real leaks from the NJ review run.
  test('a silo demolition does NOT match roofing even if the crew is tagged (roofing-crew)', () => {
    expect(clipMatchesDomain({ tags: ['silo-demolition', 'structure-teardown', 'roofing-crew', 'crew-working'], setting: 'exterior' }, 'roofing')).toBe(false);
  });

  test('an interior water-damage clip does NOT match roofing even if tagged storm-damage', () => {
    expect(clipMatchesDomain({ tags: ['water-damage-interior', 'storm-damage', 'interior-demo-gutting'], setting: 'interior' }, 'roofing')).toBe(false);
  });
});

describe('clipMatchesDomain — remodeling', () => {
  test('a tiling/bathroom interior clip matches remodeling', () => {
    expect(clipMatchesDomain({ tags: ['bathroom-remodel', 'shower-tiling'], setting: 'interior' }, 'remodeling')).toBe(true);
  });

  test('a roof clip does NOT match remodeling', () => {
    expect(clipMatchesDomain({ tags: ['shingle-install'], setting: 'roof' }, 'remodeling')).toBe(false);
  });
});

describe('clipDomain', () => {
  test('classifies roofing, remodeling, and other', () => {
    expect(clipDomain({ tags: ['roof-teardown'], setting: 'roof' })).toBe('roofing');
    expect(clipDomain({ tags: ['kitchen-remodel'], setting: 'interior' })).toBe('remodeling');
    expect(clipDomain({ tags: ['silo-demolition', 'generic-action'], setting: 'exterior' })).toBe('other');
  });
});
