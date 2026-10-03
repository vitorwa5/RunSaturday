export interface AuthTicket { signal: AbortSignal; isCurrent(): boolean }

/** One generation owns all asynchronous auth/personal results, including across effect remounts. */
export class AuthEpoch {
  private generation = 0;
  private controller = new AbortController();
  private active = true;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  get busy() { return this.pending > 0; }
  get mounted() { return this.active; }
  ticket(): AuthTicket {
    const generation = this.generation;
    return { signal: this.controller.signal, isCurrent: () => this.active && generation === this.generation };
  }
  advance(): AuthTicket {
    this.controller.abort(); this.controller = new AbortController(); this.generation++;
    return this.ticket();
  }
  mount() { this.active = true; this.advance(); }
  dispose() { this.active = false; this.advance(); }
  transition<T>(action: (ticket: AuthTicket) => Promise<T>): Promise<T> {
    const ticket = this.advance(); this.pending++;
    const result = this.queue.then(async () => {
      if (!this.active) throw new DOMException('Account view closed', 'AbortError');
      // Serialize auth writes instead of aborting mid-flight: their response may still set cookies.
      return action(ticket);
    }).finally(() => { this.pending--; });
    this.queue = result.catch(() => undefined);
    return result;
  }
}

/** Serialize cookie changes and session reads between supported browser tabs. */
export async function withAuthLock<T>(action: () => Promise<T>, signal?: AbortSignal, requireCrossTab = false): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return await navigator.locks.request('5k-compass-auth', { ...(signal ? { signal } : {}) }, action);
  }
  if (requireCrossTab) throw new Error('This browser cannot safely change accounts across tabs. Please use an updated browser.');
  return action();
}
