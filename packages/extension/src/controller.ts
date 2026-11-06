/**
 * Start/stop state for the commentary page, free of DOM so it can be tested. Audio may only start
 * from a user click (MV3), so `start` is called from the Start button handler.
 */
export type BroadcastState = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

export interface BroadcastHooks {
  /** Starts audio and the match feed. Runs inside the click handler. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ViewModel {
  state: BroadcastState;
  status: string;
  startEnabled: boolean;
  stopEnabled: boolean;
}

export interface BroadcastController {
  readonly view: ViewModel;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (view: ViewModel) => void): () => void;
}

const STATUS: Record<BroadcastState, string> = {
  idle: 'Ready. Press Start to begin the broadcast.',
  starting: 'Starting…',
  running: 'On air.',
  stopping: 'Stopping…',
  error: 'Something went wrong. Press Start to try again.',
};

export function viewFor(state: BroadcastState, detail?: string): ViewModel {
  return {
    state,
    status: detail ? `${STATUS[state]} ${detail}` : STATUS[state],
    startEnabled: state === 'idle' || state === 'error',
    stopEnabled: state === 'running',
  };
}

export function createBroadcastController(hooks: BroadcastHooks): BroadcastController {
  let view = viewFor('idle');
  const listeners = new Set<(view: ViewModel) => void>();
  const set = (next: ViewModel) => {
    view = next;
    for (const l of listeners) l(view);
  };

  return {
    get view() {
      return view;
    },
    async start() {
      if (!view.startEnabled) return;
      set(viewFor('starting'));
      try {
        await hooks.start();
        set(viewFor('running'));
      } catch (error) {
        set(viewFor('error', error instanceof Error ? error.message : undefined));
      }
    },
    async stop() {
      if (!view.stopEnabled) return;
      set(viewFor('stopping'));
      try {
        await hooks.stop();
        set(viewFor('idle'));
      } catch (error) {
        set(viewFor('error', error instanceof Error ? error.message : undefined));
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(view);
      return () => listeners.delete(listener);
    },
  };
}
