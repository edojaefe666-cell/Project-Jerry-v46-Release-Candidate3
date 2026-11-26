/**
 * Process-local cancellation registry for work that must stop promptly when
 * the owner engages Jerry's emergency stop. This complements (does not replace)
 * the durable emergency-stop latch and route-level execution guards.
 */
export class ExecutionRegistry {
  private stopped: boolean;
  private readonly active = new Set<AbortController>();

  constructor(stopped = true) {
    this.stopped = stopped;
  }

  setStopped(stopped: boolean, reason = 'Jerry emergency stop engaged'): void {
    this.stopped = stopped;
    if (stopped) {
      for (const controller of this.active) {
        if (!controller.signal.aborted) controller.abort(new Error(reason));
      }
    }
  }

  register(): { signal: AbortSignal; release: () => void } {
    const controller = new AbortController();
    this.active.add(controller);
    // Register first, then inspect the latch. This closes the check/register
    // race: a concurrent stop either sees this controller or this check does.
    if (this.stopped) controller.abort(new Error('Jerry emergency stop is active'));
    let released = false;
    return {
      signal: controller.signal,
      release: () => {
        if (released) return;
        released = true;
        this.active.delete(controller);
      },
    };
  }

  get activeCount(): number {
    return this.active.size;
  }

  get isStopped(): boolean {
    return this.stopped;
  }
}
