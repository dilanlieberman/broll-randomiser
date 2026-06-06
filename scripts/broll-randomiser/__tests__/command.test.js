const { parseCommand } = require('../lib/command');

describe('parseCommand', () => {
  test('roofing ad NJ → roofing domain, NJ', () => {
    expect(parseCommand('roofing ad NJ')).toEqual({ service: 'roofing', domain: 'roofing', state: 'NJ' });
  });

  test('bathroom ad NY → remodeling domain, NY', () => {
    expect(parseCommand('bathroom ad NY')).toEqual({ service: 'bathroom', domain: 'remodeling', state: 'NY' });
  });

  test('kitchen maps to remodeling', () => {
    expect(parseCommand('kitchen ad California').domain).toBe('remodeling');
  });

  test('multi-word state is preserved with original casing', () => {
    expect(parseCommand('roofing ad New Jersey').state).toBe('New Jersey');
  });

  test('works without the literal "ad" keyword', () => {
    expect(parseCommand('roofing NJ')).toEqual({ service: 'roofing', domain: 'roofing', state: 'NJ' });
  });

  test('unknown service yields a null domain (caller decides)', () => {
    expect(parseCommand('siding ad NJ').domain).toBeNull();
  });

  test('no state yields null state', () => {
    expect(parseCommand('roofing ad').state).toBeNull();
  });

  test('empty / junk input returns null', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('   ')).toBeNull();
  });
});
