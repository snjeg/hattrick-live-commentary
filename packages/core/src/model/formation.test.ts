import { describe, expect, it } from 'vitest';
import { decodeFormation } from './formation';

describe('decodeFormation', () => {
  it('decodes codes seen in real data', () => {
    expect(decodeFormation(1030502)).toEqual({
      defenders: 3,
      midfielders: 5,
      attackers: 2,
      label: '3-5-2',
    });
    expect(decodeFormation('1040402')?.label).toBe('4-4-2');
    expect(decodeFormation(1020503)?.label).toBe('2-5-3');
  });

  it('rejects codes that are not formations', () => {
    expect(decodeFormation(0)).toBeUndefined();
    expect(decodeFormation(17417)).toBeUndefined();
    expect(decodeFormation(2030502)).toBeUndefined();
    expect(decodeFormation(1030503)).toBeUndefined(); // 11 outfield players
  });
});
