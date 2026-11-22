/**
 * Coalesce high-frequency deltas into frame-aligned renders.
 *
 * A model that streams 40 tokens/second and a UI that calls setState per token
 * means 40 React renders/second, each re-parsing markdown of the whole answer.
 * Cost grows with answer length, so long answers get slower the more they
 * stream — the worst possible shape for a "slow, long" task.
 *
 * Deltas are therefore buffered and flushed on an interval (one frame by
 * default). The text the UI renders is identical; the number of renders drops
 * by an order of magnitude.
 */

export interface BatcherStats {
  /** Deltas received. */
  chunks: number;
  /** Renders produced. */
  flushes: number;
  /** Deltas that never got a render of their own. */
  coalesced: number;
  /** Characters waiting for the next flush. */
  pending: number;
}

export interface DeltaBatcherOptions {
  onFlush: (text: string) => void;
  /** Flush interval in ms. Defaults to 16 (one frame). */
  intervalMs?: number;
  /** Injectable timer for tests. Returns a cancel function. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export class DeltaBatcher {
  private buffer = "";
  private cancelTimer: (() => void) | null = null;
  private chunks = 0;
  private flushes = 0;
  private readonly onFlush: (text: string) => void;
  private readonly intervalMs: number;
  private readonly schedule: (fn: () => void, ms: number) => () => void;

  constructor(options: DeltaBatcherOptions) {
    this.onFlush = options.onFlush;
    this.intervalMs = options.intervalMs ?? 16;
    this.schedule = options.schedule ?? defaultSchedule;
  }

  push(chunk: string): void {
    if (chunk === "") return;
    this.chunks += 1;
    this.buffer += chunk;
    if (this.cancelTimer !== null) return;
    this.cancelTimer = this.schedule(() => {
      this.cancelTimer = null;
      this.emit();
    }, this.intervalMs);
  }

  /** Flush immediately (use before finishing a message). */
  flushNow(): void {
    if (this.cancelTimer !== null) {
      this.cancelTimer();
      this.cancelTimer = null;
    }
    this.emit();
  }

  get stats(): BatcherStats {
    return {
      chunks: this.chunks,
      flushes: this.flushes,
      coalesced: this.flushes === 0 ? 0 : this.chunks - this.flushes,
      pending: this.buffer.length,
    };
  }

  /** Flush what is left and stop the timer. */
  dispose(): void {
    this.flushNow();
  }

  private emit(): void {
    if (this.buffer === "") return;
    const text = this.buffer;
    this.buffer = "";
    this.flushes += 1;
    this.onFlush(text);
  }
}
