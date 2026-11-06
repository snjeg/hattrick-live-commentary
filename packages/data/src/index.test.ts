import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@hlc/data scaffold', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@hlc/data');
  });
});
