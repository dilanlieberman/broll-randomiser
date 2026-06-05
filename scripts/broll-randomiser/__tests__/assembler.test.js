const { buildAssemblyPlan, planTotalDuration } = require('../lib/assembler');

describe('buildAssemblyPlan', () => {
  const windows = [
    { start: 0, end: 4, text: '', theme: 'roof-teardown' },
    { start: 4, end: 10, text: '', theme: 'shingle-install' },
  ];
  const clips = [
    { id: 'x', path: 'lib/x.mp4', duration: 8 }, // longer than its 4s window
    { id: 'y', path: 'lib/y.mp4', duration: 3 }, // shorter than its 6s window -> loop
  ];

  test('each entry takes exactly its window duration', () => {
    const plan = buildAssemblyPlan(windows, clips);
    expect(plan.map((p) => p.take)).toEqual([4, 6]);
  });

  test('flags loop only when the clip is shorter than its window', () => {
    const plan = buildAssemblyPlan(windows, clips);
    expect(plan[0].loop).toBe(false); // 8s clip into 4s window
    expect(plan[1].loop).toBe(true); //  3s clip into 6s window
  });

  test('carries clip id and path through for the ffmpeg step', () => {
    const plan = buildAssemblyPlan(windows, clips);
    expect(plan[0]).toMatchObject({ id: 'x', path: 'lib/x.mp4' });
  });
});

describe('planTotalDuration', () => {
  test('equals the voiceover duration D (windows tile [0, D])', () => {
    const windows = [
      { start: 0, end: 4 },
      { start: 4, end: 10 },
      { start: 10, end: 13.5 },
    ];
    const clips = windows.map((_, i) => ({ id: `c${i}`, path: `c${i}.mp4`, duration: 5 }));
    const plan = buildAssemblyPlan(windows, clips);
    expect(planTotalDuration(plan)).toBeCloseTo(13.5, 5);
  });
});
