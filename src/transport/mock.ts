/**
 * A deterministic fake model, so the demo runs with no API key and no backend.
 *
 * It is a real SSE-shaped transport: same chunking, same latency, same failure
 * mode (connection reset halfway) — which is exactly what the resume logic
 * needs to be exercised against.
 */

import type { Transport } from "../engine/stream";

export interface MockOptions {
  script: string;
  /** Characters per chunk. */
  chunkMin?: number;
  chunkMax?: number;
  /** Delay between bursts, ms. */
  delayMs?: number;
  /** Chunks delivered back to back before a pause (real networks burst too). */
  burstMin?: number;
  burstMax?: number;
  /** Drop the connection once the cursor passes this offset. */
  dropAt?: number | null;
  /** Fixes the chunk sizes; same seed = same stream. */
  seed?: number;
}

/** Tiny deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createMockTransport(options: MockOptions): Transport {
  const {
    script,
    chunkMin = 2,
    chunkMax = 9,
    delayMs = 55,
    burstMin = 3,
    burstMax = 6,
    dropAt = null,
    seed = 7,
  } = options;
  let dropped = false;

  return async function* mockStream(signal: AbortSignal, from: number) {
    const random = mulberry32(seed);
    let cursor = Math.min(Math.max(from, 0), script.length);

    while (cursor < script.length) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");

      if (dropAt !== null && !dropped && cursor >= dropAt) {
        dropped = true;
        throw new Error("simulated connection reset");
      }

      const span = chunkMax - chunkMin + 1;
      const burst = burstMin + Math.floor(random() * (burstMax - burstMin + 1));
      for (let index = 0; index < burst && cursor < script.length; index += 1) {
        if (signal.aborted) throw new DOMException("aborted", "AbortError");
        if (dropAt !== null && !dropped && cursor >= dropAt) {
          dropped = true;
          throw new Error("simulated connection reset");
        }
        const size = chunkMin + Math.floor(random() * span);
        const piece = script.slice(cursor, cursor + size);
        cursor += size;
        yield piece;
      }

      if (delayMs > 0) await wait(delayMs);
    }
  };
}
