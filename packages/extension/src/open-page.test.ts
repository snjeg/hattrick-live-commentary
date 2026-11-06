import { describe, expect, it, vi } from 'vitest';
import { openOrFocusPage, type TabsApi } from './open-page';

function api(
  existing: { id?: number }[],
): TabsApi & { tabs: { [k: string]: ReturnType<typeof vi.fn> } } {
  return {
    runtime: { getURL: (p: string) => `chrome-extension://abc/${p}` },
    tabs: {
      create: vi.fn(async () => ({ id: 9 })),
      query: vi.fn(async () => existing),
      update: vi.fn(async () => ({})),
    },
  };
}

describe('openOrFocusPage', () => {
  it('opens the page in a new tab', async () => {
    const a = api([]);
    await openOrFocusPage(a);
    expect(a.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://abc/page.html' });
  });

  it('focuses the page when it is already open', async () => {
    const a = api([{ id: 4 }]);
    await openOrFocusPage(a);
    expect(a.tabs.update).toHaveBeenCalledWith(4, { active: true });
    expect(a.tabs.create).not.toHaveBeenCalled();
  });
});
