const { planSampleTimes, subCutSpan } = require('../lib/sampling');

describe('planSampleTimes', () => {
  test('short clip is clamped up to the 3-frame minimum', () => {
    const ts = planSampleTimes(8); // round(8/4)=2 -> min 3
    expect(ts).toHaveLength(3);
  });

  test('long clip is clamped down to the 24-frame cap', () => {
    expect(planSampleTimes(200)).toHaveLength(24); // round(50) -> cap 24
    expect(planSampleTimes(342)).toHaveLength(24);
  });

  test('mid clip samples ~1 frame every 4s', () => {
    expect(planSampleTimes(40)).toHaveLength(10); // round(40/4)=10
  });

  test('all timestamps lie strictly inside (0, duration) and increase', () => {
    const ts = planSampleTimes(40);
    expect(ts[0]).toBeGreaterThan(0);
    expect(ts[ts.length - 1]).toBeLessThan(40);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });
});

describe('subCutSpan', () => {
  test('a 42s span splits into 6 even ~7s pieces that tile the span', () => {
    const pieces = subCutSpan({ start: 16, end: 58 });
    expect(pieces).toEqual([
      { start: 16, end: 23 },
      { start: 23, end: 30 },
      { start: 30, end: 37 },
      { start: 37, end: 44 },
      { start: 44, end: 51 },
      { start: 51, end: 58 },
    ]);
  });

  test('a short span yields a single piece', () => {
    expect(subCutSpan({ start: 0, end: 5 })).toEqual([{ start: 0, end: 5 }]);
  });

  test('a 16s span yields two 8s pieces (round(16/7)=2)', () => {
    expect(subCutSpan({ start: 0, end: 16 })).toEqual([
      { start: 0, end: 8 },
      { start: 8, end: 16 },
    ]);
  });

  test('pieces never have gaps or overlap and end exactly at the span end', () => {
    const pieces = subCutSpan({ start: 3, end: 25 });
    expect(pieces[0].start).toBe(3);
    expect(pieces[pieces.length - 1].end).toBe(25);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i].start).toBe(pieces[i - 1].end);
  });
});
