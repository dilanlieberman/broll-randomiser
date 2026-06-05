const { segmentWindows } = require('../lib/segmenter');

// Helper: build a word stream from [word, start, end] tuples.
const W = (rows) => rows.map(([word, start, end]) => ({ word, start, end }));

describe('segmentWindows', () => {
  test('breaks on a sentence end once the window is at least 3s', () => {
    const words = W([
      ['Your', 0, 0.6], ['roof', 0.6, 1.2], ['is', 1.2, 1.6], ['failing', 1.6, 2.4], ['fast.', 2.4, 3.2],
      ['We', 3.2, 3.6], ['replace', 3.6, 4.4], ['it', 4.4, 4.8], ['completely', 4.8, 5.8], ['today.', 5.8, 6.8],
    ]);
    expect(segmentWindows(words, 7.0)).toEqual([
      { start: 0, end: 3.2, text: 'Your roof is failing fast.' },
      { start: 3.2, end: 7.0, text: 'We replace it completely today.' },
    ]);
  });

  test('hard-splits a long unpunctuated run at the 6s ceiling', () => {
    const words = W([
      ['a', 0, 1], ['b', 1, 2], ['c', 2, 3], ['d', 3, 4], ['e', 4, 5], ['f', 5, 6], ['g', 6, 7], ['h', 7, 8],
    ]);
    const windows = segmentWindows(words, 8);
    for (const win of windows) expect(win.end - win.start).toBeLessThanOrEqual(6 + 1e-9);
    expect(windows[0]).toEqual({ start: 0, end: 6, text: 'a b c d e f' });
  });

  test('windows tile [0, D] with no gaps or overlap', () => {
    const words = W([['x', 0, 2], ['y', 2, 4.5], ['z.', 4.5, 5], ['w', 5, 9]]);
    const D = 10;
    const windows = segmentWindows(words, D);
    expect(windows[0].start).toBe(0);
    expect(windows[windows.length - 1].end).toBe(D);
    for (let i = 1; i < windows.length; i++) expect(windows[i].start).toBe(windows[i - 1].end);
  });

  test('silent / empty audio yields one window spanning the whole duration', () => {
    expect(segmentWindows([], 6)).toEqual([{ start: 0, end: 6, text: '' }]);
  });
});
