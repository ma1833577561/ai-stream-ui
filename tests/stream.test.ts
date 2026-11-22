import { describe, expect, it } from "vitest";
import { mergeChunk, runStream, type Transport } from "../src/engine/stream";

/** A transport that serves `script` in fixed slices, optionally failing once. */
function scriptedTransport(
  script: string,
  options: { slice?: number; failAt?: number } = {},
): { transport: Transport; calls: number[] } {
  const { slice = 4, failAt } = options;
  const calls: number[] = [];
  let failed = false;
  const transport: Transport = async function* (_signal, from) {
    calls.push(from);
    let cursor = from;
    while (cursor < script.length) {
      if (failAt !== undefined && !failed && cursor >= failAt) {
        failed = true;
        throw new Error("connection reset");
      }
      const piece = script.slice(cursor, cursor + slice);
      cursor += piece.length;
      yield piece;
    }
  };
  return { transport, calls };
}

const noSleep = () => Promise.resolve();

describe("mergeChunk", () => {
  it("appends genuinely new text", () => {
    expect(mergeChunk("Hello ", "world")).toBe("world");
  });

  it("drops an exact duplicate", () => {
    expect(mergeChunk("Hello world", "Hello world")).toBe("");
  });

  it("strips a long replayed overlap", () => {
    expect(mergeChunk("Hello wor", "Hello world")).toBe("ld");
  });

  it("does not guess on a short overlap", () => {
    expect(mergeChunk("ab", "abundant")).toBe("abundant");
  });

  it("ignores an empty chunk", () => {
    expect(mergeChunk("abc", "")).toBe("");
  });
});

describe("runStream", () => {
  it("concatenates a clean stream", async () => {
    const { transport, calls } = scriptedTransport("Hello world");
    const result = await runStream({ transport }, new AbortController().signal);
    expect(result.text).toBe("Hello world");
    expect(result.received).toBe(11);
    expect(result.attempts).toBe(1);
    expect(calls).toEqual([0]);
  });

  it("resumes from the received offset after a drop", async () => {
    const { transport, calls } = scriptedTransport("Hello world", { failAt: 6 });
    const statuses: string[] = [];
    const result = await runStream(
      { transport, sleep: noSleep, onStatus: (s) => statuses.push(s) },
      new AbortController().signal,
    );
    expect(result.text).toBe("Hello world");
    expect(result.attempts).toBe(2);
    expect(result.aborted).toBe(false);
    // Second attempt must ask for exactly what it has, not from 0.
    expect(calls).toEqual([0, 8]);
    expect(statuses).toContain("retrying");
    expect(statuses.at(-1)).toBe("done");
  });

  it("survives a server that ignores `from` and replays the whole answer", async () => {
    const script = "The quick brown fox jumps";
    let attempt = 0;
    const transport: Transport = async function* (_signal, from) {
      attempt += 1;
      if (attempt === 1) {
        yield script.slice(from, 10);
        throw new Error("reset");
      }
      // Backend ignores the offset and re-sends everything in one frame.
      yield script;
    };
    const result = await runStream({ transport, sleep: noSleep }, new AbortController().signal);
    expect(result.attempts).toBe(2);
    expect(result.text).toBe(script);
  });

  it("gives up after maxRetries and reports the error", async () => {
    const transport: Transport = async function* () {
      throw new Error("boom");
      yield ""; // unreachable, keeps the generator type happy
    };
    const statuses: string[] = [];
    const result = await runStream(
      { transport, maxRetries: 1, sleep: noSleep, onStatus: (s) => statuses.push(s) },
      new AbortController().signal,
    );
    expect(result.attempts).toBe(2);
    expect(result.text).toBe("");
    expect(result.error).toBeInstanceOf(Error);
    expect(statuses.at(-1)).toBe("error");
  });

  it("keeps partial text when aborted mid-stream", async () => {
    const controller = new AbortController();
    const transport: Transport = async function* (signal) {
      yield "partial ";
      controller.abort();
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      yield "never";
    };
    const result = await runStream({ transport, sleep: noSleep }, controller.signal);
    expect(result.text).toBe("partial ");
    expect(result.aborted).toBe(true);
  });

  it("backs off exponentially between attempts", async () => {
    const waits: number[] = [];
    const transport: Transport = async function* () {
      throw new Error("down");
      yield "";
    };
    await runStream(
      {
        transport,
        maxRetries: 3,
        retryBaseMs: 100,
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      },
      new AbortController().signal,
    );
    expect(waits).toEqual([100, 200, 400]);
  });

  it("honours a resume offset passed in from the caller", async () => {
    const { transport, calls } = scriptedTransport("0123456789");
    const deltas: string[] = [];
    const result = await runStream(
      { transport, from: 4, onDelta: (d) => deltas.push(d) },
      new AbortController().signal,
    );
    expect(calls).toEqual([4]);
    expect(result.text).toBe("456789");
    expect(deltas.join("")).toBe("456789");
  });
});
