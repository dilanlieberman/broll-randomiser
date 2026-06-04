const { isAlreadyIngested, makeClipId } = require('../lib/catalog');

describe('isAlreadyIngested (resume logic)', () => {
  const catalog = [
    { id: 'roof-teardown-0001', src_file: 'ROOFING/tear_off.mp4' },
    { id: 'crew-working-0001', src_file: 'SERVICE/crew.mp4' },
  ];

  test('returns true when the src_file is already represented', () => {
    expect(isAlreadyIngested(catalog, 'ROOFING/tear_off.mp4')).toBe(true);
  });

  test('returns false for an unseen src_file', () => {
    expect(isAlreadyIngested(catalog, 'ROOFING/new_clip.mp4')).toBe(false);
  });

  test('an empty catalog has ingested nothing', () => {
    expect(isAlreadyIngested([], 'anything.mp4')).toBe(false);
  });
});

describe('makeClipId', () => {
  test('first id for a tag is zero-padded to 4 digits, starting at 0001', () => {
    expect(makeClipId('roof-teardown', [])).toBe('roof-teardown-0001');
  });

  test('increments past the highest existing index for that tag', () => {
    const used = ['roof-teardown-0001', 'roof-teardown-0007', 'crew-working-0003'];
    expect(makeClipId('roof-teardown', used)).toBe('roof-teardown-0008');
  });

  test('counts per-tag — another tag is unaffected by roof-teardown indices', () => {
    const used = ['roof-teardown-0007'];
    expect(makeClipId('crew-working', used)).toBe('crew-working-0001');
  });
});
