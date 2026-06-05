const { matchClips } = require('../lib/matcher');

const CATALOG = [
  { id: 'a1', src_file: 'A', tags: ['roof-teardown'], quality: 'good' },
  { id: 'a2', src_file: 'A', tags: ['roof-teardown'], quality: 'good' },
  { id: 'a3', src_file: 'A', tags: ['roof-teardown'], quality: 'good' },
  { id: 'b1', src_file: 'B', tags: ['roof-teardown'], quality: 'good' },
  { id: 'c1', src_file: 'C', tags: ['shingle-install'], quality: 'usable' },
  { id: 'j1', src_file: 'J', tags: ['roof-teardown', 'brand-title-card'], quality: 'good' },
  { id: 'w1', src_file: 'W', tags: ['roof-teardown'], quality: 'weak' },
  { id: 'g1', src_file: 'G', tags: ['generic-action'], quality: 'good' },
  { id: 'g2', src_file: 'H', tags: ['generic-action'], quality: 'good' },
];

const win = (theme, i) => ({ start: i * 4, end: i * 4 + 4, text: theme, theme });

describe('matchClips', () => {
  test('same seed is deterministic; the picks are repeatable', () => {
    const windows = [win('roof-teardown', 0), win('shingle-install', 1)];
    const a = matchClips(windows, CATALOG, { seed: 7 });
    const b = matchClips(windows, CATALOG, { seed: 7 });
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  test('never picks junk: brand-title-card or weak quality', () => {
    const windows = Array.from({ length: 4 }, (_, i) => win('roof-teardown', i));
    for (let seed = 1; seed <= 20; seed++) {
      const ids = matchClips(windows, CATALOG, { seed }).filter(Boolean).map((c) => c.id);
      expect(ids).not.toContain('j1');
      expect(ids).not.toContain('w1');
    }
  });

  test('no in-reel repeats', () => {
    const windows = Array.from({ length: 4 }, (_, i) => win('roof-teardown', i));
    const ids = matchClips(windows, CATALOG, { seed: 3 }).filter(Boolean).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('caps pieces per source file and falls back when the theme pool is exhausted', () => {
    // 4 roof-teardown windows; eligible roof-teardown = a1,a2,a3,b1. Cap 2/source:
    // src A contributes at most 2, B contributes 1 -> 4th window falls back to generic-action.
    const windows = Array.from({ length: 4 }, (_, i) => win('roof-teardown', i));
    const picks = matchClips(windows, CATALOG, { seed: 5, perSourceCap: 2 }).filter(Boolean);
    const fromA = picks.filter((c) => c.src_file === 'A').length;
    expect(fromA).toBeLessThanOrEqual(2);
    expect(picks.some((c) => c.tags.includes('generic-action'))).toBe(true);
  });

  test('matches the window theme', () => {
    const picks = matchClips([win('shingle-install', 0)], CATALOG, { seed: 1 });
    expect(picks[0].id).toBe('c1');
  });

  test('reshuffles across seeds (not every seed yields the same order)', () => {
    const windows = Array.from({ length: 3 }, (_, i) => win('roof-teardown', i));
    const seqs = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      seqs.add(matchClips(windows, CATALOG, { seed }).filter(Boolean).map((c) => c.id).join(','));
    }
    expect(seqs.size).toBeGreaterThan(1);
  });
});

describe('matchClips — text + region gating', () => {
  const GEO = [
    { id: 't1', src_file: 'T', tags: ['shingle-install'], quality: 'good', has_text: true, scenery: 'temperate' },
    { id: 'nj1', src_file: 'N', tags: ['shingle-install'], quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'ind1', src_file: 'I', tags: ['shingle-install'], quality: 'good', has_text: false, scenery: 'indeterminate' },
    { id: 'snow1', src_file: 'S', tags: ['shingle-install'], quality: 'good', has_text: false, scenery: 'snowy' },
    { id: 'palm1', src_file: 'P', tags: ['shingle-install'], quality: 'good', has_text: false, scenery: 'tropical-coastal' },
  ];
  const w = [{ start: 0, end: 4, theme: 'shingle-install' }];

  test('clips with on-screen text are never picked', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const ids = matchClips(Array.from({ length: 4 }, () => w[0]), GEO, { seed }).filter(Boolean).map((c) => c.id);
      expect(ids).not.toContain('t1');
    }
  });

  test('New Jersey job excludes snowy and tropical clips', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const ids = matchClips(Array.from({ length: 4 }, () => w[0]), GEO, { seed, state: 'New Jersey' }).filter(Boolean).map((c) => c.id);
      expect(ids).not.toContain('snow1');
      expect(ids).not.toContain('palm1');
    }
  });

  test('New Jersey job keeps temperate and (loose) indeterminate clips', () => {
    const picks = matchClips([w[0], w[0]], GEO, { seed: 4, state: 'NJ' }).filter(Boolean).map((c) => c.id);
    expect(picks.every((id) => ['nj1', 'ind1'].includes(id))).toBe(true);
  });

  test('without a state, region is not gated (snowy/tropical remain eligible)', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      matchClips(Array.from({ length: 4 }, () => w[0]), GEO, { seed }).filter(Boolean).forEach((c) => seen.add(c.id));
    }
    expect(seen.has('snow1') || seen.has('palm1')).toBe(true);
  });
});
