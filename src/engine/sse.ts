/**
 * Incremental Server-Sent Events parser.
 *
 * Why not `EventSource`? Three reasons that matter for an AI chat UI:
 *   1. `EventSource` cannot send a POST body (prompts are usually POSTs);
 *   2. it cannot carry an auth header;
 *   3. it hides the raw byte stream, so you cannot measure or resume it.
 *
 * Why not a naive `chunk.split("\n\n")`? Because a chunk boundary can land
 * anywhere: in the middle of `\r\n`, in the middle of a UTF-16 surrogate pair,
 * or right after `data:`. This parser keeps a buffer, consumes only complete
 * lines, and applies the WHATWG event-stream rules field by field.
 */

export interface SseMessage {
  /** Event name; "message" when the stream did not specify one. */
  event: string;
  /** All `data:` lines joined with "\n". */
  data: string;
  /** Last seen `id:`, used by callers to resume (`Last-Event-ID`). */
  id: string | undefined;
  /** Last seen `retry:`, in milliseconds. */
  retry: number | undefined;
}

export class SseParser {
  private buffer = "";
  /** Index already scanned for line terminators (avoids O(n^2) on long lines). */
  private scanFrom = 0;
  /** A CR ended the previous chunk; swallow the LF if the next one starts with it. */
  private skipLf = false;

  private dataLines: string[] = [];
  private eventType = "";
  private lastId: string | undefined;
  private retryMs: number | undefined;

  /** Feed one decoded chunk; returns every event completed by it. */
  push(chunk: string): SseMessage[] {
    let add = chunk;
    if (this.skipLf && add.startsWith("\n")) add = add.slice(1);
    this.skipLf = false;
    if (add === "") return [];
    this.buffer += add;
    const out: SseMessage[] = [];
    for (;;) {
      const line = this.takeLine();
      if (line === null) break;
      this.consumeLine(line, out);
    }
    return out;
  }

  /** True when bytes are buffered that do not yet form a complete line. */
  get pending(): string {
    return this.buffer;
  }

  /** Reset all state (a new stream must not inherit the previous id/retry). */
  reset(): void {
    this.buffer = "";
    this.scanFrom = 0;
    this.skipLf = false;
    this.dataLines = [];
    this.eventType = "";
    this.lastId = undefined;
    this.retryMs = undefined;
  }

  private takeLine(): string | null {
    const buf = this.buffer;
    let i = this.scanFrom;
    while (i < buf.length) {
      const ch = buf[i];
      if (ch === "\n") {
        const line = buf.slice(0, i);
        this.buffer = buf.slice(i + 1);
        this.scanFrom = 0;
        return line;
      }
      if (ch === "\r") {
        // CR, CRLF and LF are all line terminators. A CR at the very end of the
        // chunk dispatches now (waiting would delay the event by a round trip)
        // and `skipLf` absorbs the LF if the CRLF was split across chunks.
        const width = buf[i + 1] === "\n" ? 2 : 1;
        const line = buf.slice(0, i);
        this.buffer = buf.slice(i + width);
        this.scanFrom = 0;
        if (i === buf.length - 1) this.skipLf = true;
        return line;
      }
      i += 1;
    }
    this.scanFrom = buf.length;
    return null;
  }

  private consumeLine(line: string, out: SseMessage[]): void {
    if (line === "") {
      // Blank line = dispatch. Per spec, an event with no data is not dispatched.
      if (this.dataLines.length > 0) {
        out.push({
          event: this.eventType || "message",
          data: this.dataLines.join("\n"),
          id: this.lastId,
          retry: this.retryMs,
        });
      }
      this.dataLines = [];
      this.eventType = "";
      return;
    }
    if (line.startsWith(":")) return; // comment / keep-alive

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "data":
        this.dataLines.push(value);
        break;
      case "event":
        this.eventType = value;
        break;
      case "id":
        if (!value.includes("\u0000")) this.lastId = value;
        break;
      case "retry": {
        if (/^\d+$/.test(value)) this.retryMs = Number(value);
        break;
      }
      default:
        break; // unknown fields are ignored, per spec
    }
  }
}
