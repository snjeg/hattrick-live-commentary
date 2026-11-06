import { describe, expect, it, vi } from 'vitest';
import { createBroadcastController, type ViewModel } from './controller';

describe('broadcast controller', () => {
  it('goes idle -> running -> idle and toggles the buttons', async () => {
    const hooks = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const c = createBroadcastController(hooks);
    const seen: ViewModel['state'][] = [];
    c.subscribe((v) => seen.push(v.state));
    expect(c.view).toMatchObject({ state: 'idle', startEnabled: true, stopEnabled: false });
    await c.start();
    expect(c.view).toMatchObject({
      state: 'running',
      startEnabled: false,
      stopEnabled: true,
      status: 'On air.',
    });
    await c.stop();
    expect(seen).toEqual(['idle', 'starting', 'running', 'stopping', 'idle']);
    expect(hooks.start).toHaveBeenCalledOnce();
    expect(hooks.stop).toHaveBeenCalledOnce();
  });

  it('ignores double clicks and stop while idle', async () => {
    const hooks = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const c = createBroadcastController(hooks);
    await c.stop();
    await Promise.all([c.start(), c.start()]);
    expect(hooks.start).toHaveBeenCalledOnce();
    expect(hooks.stop).not.toHaveBeenCalled();
  });

  it('shows an error and allows another try when start fails', async () => {
    const c = createBroadcastController({
      start: async () => {
        throw new Error('Audio blocked.');
      },
      stop: async () => {},
    });
    await c.start();
    expect(c.view).toMatchObject({ state: 'error', startEnabled: true });
    expect(c.view.status).toContain('Audio blocked.');
  });
});
