const { clipValence, valenceMatch } = require('../lib/valence');

describe('clipValence', () => {
  test('finished/before-after shots are aesthetic', () => {
    expect(clipValence({ tags: ['finished-interior-reveal', 'bathroom-remodel'] })).toBe('aesthetic');
    expect(clipValence({ tags: ['before-after', 'roof-aerial'] })).toBe('aesthetic');
  });

  test('demo / damage / teardown shots are problem', () => {
    expect(clipValence({ tags: ['interior-demo-gutting', 'single-worker'] })).toBe('problem');
    expect(clipValence({ tags: ['water-damage-interior', 'storm-damage'] })).toBe('problem');
    expect(clipValence({ tags: ['roof-teardown', 'debris-haul'] })).toBe('problem');
  });

  test('process / crew / install shots are neutral', () => {
    expect(clipValence({ tags: ['shower-tiling', 'single-worker'] })).toBe('neutral');
    expect(clipValence({ tags: ['crew-working', 'tools-closeup'] })).toBe('neutral');
  });

  test('aesthetic wins over a neutral co-tag; problem only if no aesthetic', () => {
    // a finished reveal that also shows tiling is still aesthetic
    expect(clipValence({ tags: ['finished-interior-reveal', 'floor-tiling'] })).toBe('aesthetic');
    // a demo clip that also has a generic tag is problem
    expect(clipValence({ tags: ['interior-demo-gutting', 'generic-action'] })).toBe('problem');
  });
});

describe('valenceMatch — does a clip fit a line valence?', () => {
  const problemClip = { tags: ['interior-demo-gutting'] };
  const aestheticClip = { tags: ['finished-interior-reveal'] };
  const neutralClip = { tags: ['shower-tiling'] };

  test('problem lines accept problem clips, reject aesthetic/neutral', () => {
    expect(valenceMatch(problemClip, 'problem')).toBe(true);
    expect(valenceMatch(aestheticClip, 'problem')).toBe(false);
    expect(valenceMatch(neutralClip, 'problem')).toBe(false);
  });

  test('solution lines accept aesthetic + neutral, reject problem', () => {
    expect(valenceMatch(aestheticClip, 'solution')).toBe(true);
    expect(valenceMatch(neutralClip, 'solution')).toBe(true);
    expect(valenceMatch(problemClip, 'solution')).toBe(false);
  });

  test('neutral lines accept aesthetic + neutral, reject problem (aesthetic-led)', () => {
    expect(valenceMatch(aestheticClip, 'neutral')).toBe(true);
    expect(valenceMatch(neutralClip, 'neutral')).toBe(true);
    expect(valenceMatch(problemClip, 'neutral')).toBe(false);
  });
});
