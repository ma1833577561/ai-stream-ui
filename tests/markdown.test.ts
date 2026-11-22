import { describe, expect, it } from "vitest";
import { isFenceOpen, renderable, splitForRender, stabilizeTail } from "../src/engine/markdown";

describe("isFenceOpen", () => {
  it("is false for plain text", () => {
    expect(isFenceOpen("hello world")).toBe(false);
  });

  it("is true while a fence is unterminated", () => {
    expect(isFenceOpen("intro\n```ts\nconst a = 1;")).toBe(true);
  });

  it("is false once the fence closes", () => {
    expect(isFenceOpen("```ts\nconst a = 1;\n```")).toBe(false);
  });

  it("handles tilde fences", () => {
    expect(isFenceOpen("~~~\ncode")).toBe(true);
  });
});

describe("splitForRender", () => {
  it("holds back an in-flight line so half-written markup never flips", () => {
    const split = splitForRender("Here is **bo");
    expect(split.pending).toBe("Here is **bo");
    expect(split.parsed).toBe("");
  });

  it("moves a completed line into the parsed region", () => {
    const split = splitForRender("Here is **bold**\nand a new");
    expect(split.parsed).toBe("Here is **bold**\n");
    expect(split.pending).toBe("and a new");
  });

  it("has nothing pending when the text ends with a newline", () => {
    const split = splitForRender("line one\n");
    expect(split.pending).toBe("");
    expect(split.parsed).toBe("line one\n");
  });

  it("renders the whole text inside an open fence (a growing code block does not re-flow)", () => {
    const src = "```ts\nconst a = 1;\nconst b = 2;";
    expect(splitForRender(src)).toEqual({ parsed: src, pending: "" });
  });

  it("splits normally after the fence closes", () => {
    const split = splitForRender("```ts\nconst a = 1;\n```\ntail");
    expect(split.parsed).toBe("```ts\nconst a = 1;\n```\n");
    expect(split.pending).toBe("tail");
  });

  it("treats empty input as empty output", () => {
    expect(splitForRender("")).toEqual({ parsed: "", pending: "" });
  });

  it("keeps the parsed prefix byte-identical to the input prefix", () => {
    const src = "a\nb\nc\nd";
    const split = splitForRender(src);
    expect(src.startsWith(split.parsed)).toBe(true);
    expect(split.parsed + split.pending).toBe(src);
  });
});

describe("stabilizeTail", () => {
  it("closes an open bold span", () => {
    expect(stabilizeTail("Here is **bo")).toBe("Here is **bo**");
  });

  it("leaves balanced bold alone", () => {
    expect(stabilizeTail("Here is **bold**")).toBe("Here is **bold**");
  });

  it("closes an open inline code span", () => {
    expect(stabilizeTail("run `npm test")).toBe("run `npm test`");
  });

  it("closes an open strikethrough", () => {
    expect(stabilizeTail("~~dropp")).toBe("~~dropp~~");
  });

  it("does not guess on a single asterisk", () => {
    expect(stabilizeTail("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("is stable: stabilizing twice changes nothing", () => {
    const once = stabilizeTail("a **b `c");
    expect(stabilizeTail(once)).toBe(once);
  });
});

describe("renderable", () => {
  it("stabilizes only the trailing line", () => {
    expect(renderable("done **line**\nopen **par")).toBe("done **line**\nopen **par**");
  });

  it("leaves text inside an open fence untouched", () => {
    const src = "```js\nconst s = `a`;\nconst t = `b";
    expect(renderable(src)).toBe(src);
  });

  it("never drops characters once the tail is balanced", () => {
    const src = "plain text\nplain line";
    expect(renderable(src)).toBe(src);
  });
});

describe("renderable: tables in flight", () => {
  it("hides a table whose delimiter row has not arrived", () => {
    expect(renderable("intro\n\n| a | b |\n")).toBe("intro\n\n");
  });

  it("hides a delimiter row that is shorter than the header", () => {
    expect(renderable("intro\n\n| a | b | c |\n| --- | --- |")).toBe("intro\n\n");
  });

  it("shows the table once the delimiter row is complete", () => {
    const src = "intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |";
    expect(renderable(src)).toBe(src);
  });

  it("leaves ordinary text alone", () => {
    expect(renderable("intro\n\nplain line")).toBe("intro\n\nplain line");
  });
});
