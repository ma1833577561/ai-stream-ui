/**
 * Real backend transport: POST a prompt, read the SSE body, yield text deltas.
 *
 * Contract expected from the server (one line): a POST that accepts
 * `{ "from": <char offset> }` and streams `data: <text delta>` events,
 * optionally with `id:` set to the character offset after that delta. Resuming
 * a dropped answer is then just the same POST with a larger `from`.
 */

import { SseParser } from "../engine/sse";
import type { Transport } from "../engine/stream";

export interface FetchTransportOptions {
  url: string;
  headers?: Record<string, string>;
  /** Extra JSON merged into the POST body. */
  body?: Record<string, unknown>;
  /** SSE event name carrying text deltas. Defaults to "delta". */
  deltaEvent?: string;
}

export function createFetchTransport(options: FetchTransportOptions): Transport {
  const { url, headers = {}, body = {}, deltaEvent = "delta" } = options;

  return async function* fetchStream(signal: AbortSignal, from: number) {
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "text/event-stream", ...headers },
      body: JSON.stringify({ ...body, from }),
    });
    if (!response.ok || response.body === null) {
      throw new Error(`stream failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // `stream: true` is what keeps a UTF-8 character split across two
        // network chunks from becoming a replacement character.
        for (const message of parser.push(decoder.decode(value, { stream: true }))) {
          if (message.event === deltaEvent || message.event === "message") {
            yield message.data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };
}
