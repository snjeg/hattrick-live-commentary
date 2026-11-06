import { expect, it } from 'vitest';

// Temporary: proves the main ruleset blocks merging while CI is red. Removed before merge.
it('fails on purpose to test the ruleset', () => {
  expect(1).toBe(2);
});
