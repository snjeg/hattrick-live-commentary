import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@hlc/audio scaffold', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@hlc/audio');
  });
});
