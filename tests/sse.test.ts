import { describe, expect, it } from "vitest";
import { SseParser } from "../src/engine/sse";

describe("SseParser", () => {
  it("parses a simple event", () => {
    const parser = new SseParser();
    const events = parser.push("data: hello\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe("hello");
    expect(events[0]?.event).toBe("message");
  });

  it("waits for a complete event before dispatching", () => {
    const parser = new SseParser();
    expect(parser.push("data: hel")).toEqual([]);
    expect(parser.push("lo\n")).toEqual([]);
    const events = parser.push("\n");
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe("hello");
  });

  it("never loses an event when the split lands anywhere in the frame", () => {
    const frame = "event: delta\ndata: 0123456789\n\n";
    for (let cut = 1; cut < frame.length; cut += 1) {
      const parser = new SseParser();
      const events = [
        ...parser.push(frame.slice(0, cut)),
        ...parser.push(frame.slice(cut)),
      ];
      expect(events, `split at ${cut}`).toHaveLength(1);
      expect(events[0]?.event, `split at ${cut}`).toBe("delta");
      expect(events[0]?.data, `split at ${cut}`).toBe("0123456789");
    }
  });

  it("treats CRLF as one terminator", () => {
    const parser = new SseParser();
    const events = parser.push("data: a\r\n\r\n");
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe("a");
    expect(parser.pending).toBe("");
  });

  it("does not read the LF of a split CRLF as a blank line", () => {
    const parser = new SseParser();
    // Only a line terminator so far: the event is not complete.
    expect(parser.push("data: a\r")).toEqual([]);
    // LF completes the CRLF, the following CRLF is the blank line that dispatches.
    const events = parser.push("\n\r\n");
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe("a");
    expect(parser.pending).toBe("");
  });

  it("treats a lone CR as a line terminator", () => {
    const parser = new SseParser();
    const events = parser.push("data: a\r\r");
    expect(events[0]?.data).toBe("a");
  });

  it("joins multiple data lines with a newline", () => {
    const parser = new SseParser();
    const events = parser.push("data: line1\ndata: line2\n\n");
    expect(events[0]?.data).toBe("line1\nline2");
  });

  it("ignores comments and unknown fields", () => {
    const parser = new SseParser();
    const events = parser.push(": keep-alive\nfoo: bar\ndata: x\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe("x");
  });

  it("does not dispatch an event with no data", () => {
    const parser = new SseParser();
    expect(parser.push("event: ping\n\n")).toEqual([]);
    expect(parser.push("data: real\n\n")).toHaveLength(1);
  });

  it("remembers id and retry, and keeps id across events", () => {
    const parser = new SseParser();
    parser.push("id: 42\nretry: 1500\ndata: a\n\n");
    const second = parser.push("data: b\n\n");
    expect(second[0]?.id).toBe("42");
    expect(second[0]?.retry).toBe(1500);
  });

  it("ignores a non-numeric retry", () => {
    const parser = new SseParser();
    const events = parser.push("retry: soon\ndata: a\n\n");
    expect(events[0]?.retry).toBeUndefined();
  });

  it("keeps a surrogate pair intact when it is split across chunks", () => {
    const emoji = "\u{1F600}";
    const high = emoji.slice(0, 1);
    const low = emoji.slice(1);
    expect(high.length + low.length).toBe(2);

    const parser = new SseParser();
    parser.push(`data: ${high}`);
    const events = parser.push(`${low}\n\n`);
    expect(events[0]?.data).toBe(emoji);
  });

  it("exposes the incomplete tail and can reset", () => {
    const parser = new SseParser();
    parser.push("data: abc");
    expect(parser.pending).toBe("data: abc");
    parser.reset();
    expect(parser.pending).toBe("");
    expect(parser.push("data: new\n\n")[0]?.data).toBe("new");
  });

  it("parses many events from one chunk", () => {
    const parser = new SseParser();
    const events = parser.push("data: a\n\ndata: b\n\ndata: c\n\n");
    expect(events.map((e) => e.data)).toEqual(["a", "b", "c"]);
  });
});
