/**
 * Stream orchestration: consume a transport, merge deltas, survive a drop.
 *
 * The transport contract is one line long on purpose:
 *
 *   transport(signal, from) -> async iterable of text chunks, starting at
 *   character offset `from` of the server-side answer.
 *
 * Everything else (retry, backoff, duplicate merging, abort) lives here, so it
 * can be unit-tested without a browser, a network, or a DOM.
 */

export type StreamStatus =
  | "connecting"
  | "streaming"
  | "retrying"
  | "done"
  | "aborted"
  | "error";

export type Transport = (signal: AbortSignal, from: number) => AsyncIterable<string>;

export interface RunStreamOptions {
  transport: Transport;
  /** Resume offset (e.g. after a page reload). Defaults to 0. */
  from?: number;
  /** Extra attempts after the first failure. Defaults to 2. */
  maxRetries?: number;
  /** Base backoff; doubles per attempt. Defaults to 300ms. */
  retryBaseMs?: number;
  /** Injectable for tests (defaults to a real setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  onDelta?: (chunk: string) => void;
  onStatus?: (status: StreamStatus, attempt: number) => void;
}

export interface RunStreamResult {
  text: string;
  /** Offset consumed from the server stream; pass it back as `from` to resume. */
  received: number;
  attempts: number;
  aborted: boolean;
  duplicatesSkipped: number;
  error?: unknown;
}

/**
 * Merge a chunk into the text already received.
 *
 * Resuming from a byte offset is easy; resuming from the offset the *server*
 * thinks you want is not. Some backends replay from the beginning of the
 * message, some from the last event, some from the last token. Replayed text
 * must not be duplicated.
 *
 * Rule: strip a trailing overlap of at least 8 characters (a real replay is
 * always longer than that), and drop exact duplicates. Short overlaps are
 * ambiguous — "ab" + "abundant" can be either a replay or genuine text — so
 * they are appended rather than guessed at.
 */
export function mergeChunk(existing: string, incoming: string): string {
  if (incoming === "") return "";
  if (existing.endsWith(incoming)) return "";
  const max = Math.min(existing.length, incoming.length);
  for (let k = max; k >= 8; k -= 1) {
    if (existing.endsWith(incoming.slice(0, k))) return incoming.slice(k);
  }
  return incoming;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function runStream(
  options: RunStreamOptions,
  signal: AbortSignal,
): Promise<RunStreamResult> {
  const {
    transport,
    from = 0,
    maxRetries = 2,
    retryBaseMs = 300,
    sleep = realSleep,
    onDelta,
    onStatus,
  } = options;

  let text = "";
  let received = from;
  let attempts = 0;
  let duplicatesSkipped = 0;

  for (;;) {
    attempts += 1;
    onStatus?.(attempts > 1 ? "retrying" : "streaming", attempts);

    try {
      for await (const chunk of transport(signal, received)) {
        const fresh = mergeChunk(text, chunk);
        if (fresh === "") {
          if (chunk !== "") duplicatesSkipped += 1;
          continue;
        }
        text += fresh;
        received += fresh.length;
        onDelta?.(fresh);
      }
      onStatus?.("done", attempts);
      return { text, received, attempts, aborted: false, duplicatesSkipped };
    } catch (error) {
      if (signal.aborted) {
        onStatus?.("aborted", attempts);
        return { text, received, attempts, aborted: true, duplicatesSkipped };
      }
      if (attempts > maxRetries) {
        onStatus?.("error", attempts);
        return { text, received, attempts, aborted: false, duplicatesSkipped, error };
      }
      const backoff = retryBaseMs * 2 ** (attempts - 1);
      onStatus?.("retrying", attempts);
      await sleep(backoff);
      if (signal.aborted) {
        onStatus?.("aborted", attempts);
        return { text, received, attempts, aborted: true, duplicatesSkipped };
      }
      // `received` is unchanged, so the next attempt asks for the same offset.
    }
  }
}
