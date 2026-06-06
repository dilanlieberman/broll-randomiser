const { matchClips, isClosingWorthy } = require('../lib/matcher');

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

  test('matches the window theme (on a non-final window)', () => {
    // Two windows so window 0 is a normal (non-closer) theme match.
    const picks = matchClips([win('shingle-install', 0), win('roof-teardown', 1)], CATALOG, { seed: 1 });
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

describe('isClosingWorthy', () => {
  test('a finished/aerial/establishing shot is closing-worthy', () => {
    expect(isClosingWorthy({ tags: ['establishing-exterior', 'roof-aerial'], quality: 'good' })).toBe(true);
    expect(isClosingWorthy({ tags: ['ridge-cap', 'shingle-install'], quality: 'good' })).toBe(true);
  });
  test('a teardown or damage shot is NOT closing-worthy', () => {
    expect(isClosingWorthy({ tags: ['roof-teardown', 'roof-aerial'], quality: 'good' })).toBe(false);
    expect(isClosingWorthy({ tags: ['storm-damage', 'establishing-exterior'], quality: 'good' })).toBe(false);
  });
  test('a weak-quality clip is never closing-worthy', () => {
    expect(isClosingWorthy({ tags: ['establishing-exterior'], quality: 'weak' })).toBe(false);
  });
});

describe('matchClips — always ends on a good note', () => {
  const CLOSE = [
    { id: 'mid1', src_file: 'A', tags: ['shingle-install'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'tear1', src_file: 'B', tags: ['roof-teardown'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'tear2', src_file: 'C', tags: ['roof-teardown'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'finish1', src_file: 'D', tags: ['establishing-exterior', 'roof-aerial'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
  ];

  test('the final clip is closing-worthy even when the last line\'s theme is teardown', () => {
    const windows = [
      { start: 0, end: 4, theme: 'shingle-install' },
      { start: 4, end: 8, theme: 'roof-teardown' }, // CTA line happens to map to teardown
    ];
    for (let seed = 1; seed <= 15; seed++) {
      const picks = matchClips(windows, CLOSE, { seed, domain: 'roofing' }).filter(Boolean);
      const last = picks[picks.length - 1];
      expect(isClosingWorthy(last)).toBe(true);
      expect(last.id).toBe('finish1');
    }
  });
});

describe('matchClips — theme diversity (look unique)', () => {
  const DIV = [
    { id: 's1', src_file: 'S1', tags: ['shingle-install'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 's2', src_file: 'S2', tags: ['shingle-install'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 't1', src_file: 'T', tags: ['roof-teardown'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'a1', src_file: 'A', tags: ['roof-aerial'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'c1', src_file: 'C', tags: ['roofing-crew'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'v1', src_file: 'V', tags: ['valley-work'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'r1', src_file: 'R', tags: ['ridge-cap'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
  ];
  // 5 windows ALL assigned the same theme + a final window.
  const sameThemeWindows = Array.from({ length: 6 }, (_, i) => ({ start: i * 4, end: i * 4 + 4, theme: 'shingle-install' }));

  test('does not pour 5 same-theme lines into 5 identical-looking clips', () => {
    const picks = matchClips(sameThemeWindows, DIV, { seed: 3, domain: 'roofing' }).filter(Boolean);
    const nonFinal = picks.slice(0, -1);
    const dominants = nonFinal.map((c) => c.tags[0]);
    expect(new Set(dominants).size).toBeGreaterThanOrEqual(3); // spread, not all shingle-install
  });

  test('never repeats the same dominant shot back-to-back', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const picks = matchClips(sameThemeWindows, DIV, { seed, domain: 'roofing' }).filter(Boolean);
      for (let i = 1; i < picks.length; i++) {
        expect(picks[i].tags[0]).not.toBe(picks[i - 1].tags[0]);
      }
    }
  });
});

describe('matchClips — domain gating', () => {
  const MIX = [
    { id: 'roof1', src_file: 'R', tags: ['generic-action'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'roof2', src_file: 'R2', tags: ['shingle-install'], setting: 'roof', quality: 'good', has_text: false, scenery: 'temperate' },
    { id: 'kitchen1', src_file: 'K', tags: ['kitchen-remodel', 'generic-action'], setting: 'interior', quality: 'good', has_text: false, scenery: 'indeterminate' },
    { id: 'silo1', src_file: 'S', tags: ['silo-demolition', 'generic-action'], setting: 'exterior', quality: 'good', has_text: false, scenery: 'temperate' },
  ];
  const gw = (theme) => ({ start: 0, end: 4, theme });

  test('a roofing reel never pulls interior remodel or demolition/generic clips', () => {
    const windows = [gw('generic-action'), gw('shingle-install'), gw('generic-action')];
    for (let seed = 1; seed <= 15; seed++) {
      const ids = matchClips(windows, MIX, { seed, domain: 'roofing' }).filter(Boolean).map((c) => c.id);
      expect(ids).not.toContain('kitchen1');
      expect(ids).not.toContain('silo1');
      expect(ids.every((id) => id.startsWith('roof'))).toBe(true);
    }
  });
});
