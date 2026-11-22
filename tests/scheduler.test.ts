import { describe, expect, it } from "vitest";
import { DeltaBatcher } from "../src/engine/scheduler";

/** A timer the test drives by hand. */
function manualClock() {
  let pending: (() => void) | null = null;
  let scheduled = 0;
  const schedule = (fn: () => void, _ms: number): (() => void) => {
    scheduled += 1;
    pending = fn;
    return () => {
      pending = null;
    };
  };
  const tick = (): void => {
    const fn = pending;
    pending = null;
    fn?.();
  };
  return { schedule, tick, get scheduled() { return scheduled; } };
}

describe("DeltaBatcher", () => {
  it("coalesces many deltas into one flush", () => {
    const clock = manualClock();
    const flushes: string[] = [];
    const batcher = new DeltaBatcher({
      onFlush: (t) => flushes.push(t),
      schedule: clock.schedule,
    });

    batcher.push("a");
    batcher.push("b");
    batcher.push("c");
    expect(flushes).toEqual([]);
    expect(batcher.stats.pending).toBe(3);

    clock.tick();
    expect(flushes).toEqual(["abc"]);
    expect(batcher.stats).toMatchObject({ chunks: 3, flushes: 1, coalesced: 2, pending: 0 });
  });

  it("schedules at most one timer for a burst", () => {
    const clock = manualClock();
    const batcher = new DeltaBatcher({ onFlush: () => {}, schedule: clock.schedule });
    batcher.push("a");
    batcher.push("b");
    batcher.push("c");
    expect(clock.scheduled).toBe(1);
  });

  it("flushes immediately on demand", () => {
    const clock = manualClock();
    const flushes: string[] = [];
    const batcher = new DeltaBatcher({
      onFlush: (t) => flushes.push(t),
      schedule: clock.schedule,
    });
    batcher.push("hello");
    batcher.flushNow();
    expect(flushes).toEqual(["hello"]);
    // A timer that fires after flushNow must not double-emit.
    clock.tick();
    expect(flushes).toEqual(["hello"]);
  });

  it("does not emit empty frames", () => {
    const clock = manualClock();
    const flushes: string[] = [];
    const batcher = new DeltaBatcher({
      onFlush: (t) => flushes.push(t),
      schedule: clock.schedule,
    });
    batcher.push("");
    clock.tick();
    clock.tick();
    expect(flushes).toEqual([]);
    expect(batcher.stats.flushes).toBe(0);
  });

  it("flushes the tail on dispose", () => {
    const clock = manualClock();
    const flushes: string[] = [];
    const batcher = new DeltaBatcher({
      onFlush: (t) => flushes.push(t),
      schedule: clock.schedule,
    });
    batcher.push("last words");
    batcher.dispose();
    expect(flushes).toEqual(["last words"]);
  });
});
