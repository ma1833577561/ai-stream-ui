/**
 * Flicker-free markdown for a token stream.
 *
 * The problem: a markdown renderer sees `**bo` and renders a literal `**bo`.
 * Ten tokens later it sees `**bold**` and re-renders as <strong>. On a fast
 * stream that is dozens of layout flips per second — the "shivering" that makes
 * streaming UIs feel cheap.
 *
 * The fix is not a smarter parser. It is to stop feeding the parser text that
 * is still being written:
 *
 *   - the *last, incomplete line* is held back and rendered as plain text, so a
 *     half-written `**bo` never becomes markup and never flips later;
 *   - inside an open ``` fence nothing is held back: an unterminated code block
 *     is valid CommonMark (runs to end of input), and a code block that grows
 *     line by line does not re-flow its earlier lines.
 *
 * Completed messages skip this entirely: once the stream is done, the whole
 * text is rendered as normal markdown.
 */

const FENCE = /^(?:```|~~~)/;

/** True when the text ends inside an unterminated fenced code block. */
export function isFenceOpen(src: string): boolean {
  let open = false;
  for (const line of src.split("\n")) {
    if (FENCE.test(line.trimStart())) open = !open;
  }
  return open;
}

export interface RenderSplit {
  /** Safe to hand to the markdown renderer. */
  parsed: string;
  /** Still in flight: render as plain text, do not parse. */
  pending: string;
}

export function splitForRender(src: string): RenderSplit {
  if (src === "") return { parsed: "", pending: "" };
  if (isFenceOpen(src)) return { parsed: src, pending: "" };

  const lastBreak = src.lastIndexOf("\n");
  if (lastBreak === -1) return { parsed: "", pending: src };
  return { parsed: src.slice(0, lastBreak + 1), pending: src.slice(lastBreak + 1) };
}

const count = (src: string, needle: string): number => src.split(needle).length - 1;

/**
 * Close the inline constructs a half-written line leaves open.
 *
 * Holding the line back entirely (and rendering it as plain text) removes the
 * shivering but replaces it with a single visible "pop" per line. Appending the
 * missing delimiter is better: `Here is **bo` renders as bold "bo" from the
 * first token, and keeps rendering bold as it grows into `**bold**`.
 *
 * Only delimiters that are unambiguous in a chat message are auto-closed:
 * `**`, `` ` `` and `~~`. A single `*` or `_` is skipped on purpose — `2 * 3`
 * is multiplication far more often than an italic opener.
 */
export function stabilizeTail(line: string): string {
  if (line === "") return line;
  let out = line;
  if (count(out, "**") % 2 === 1) out += "**";
  if (count(out, "`") % 2 === 1) out += "`";
  if (count(out, "~~") % 2 === 1) out += "~~";
  return out;
}

/**
 * The exact string to hand to the markdown renderer for a message that is
 * still streaming. Inside an open fence nothing is rewritten; otherwise only
 * the trailing partial line is stabilized.
 */
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

/** Cells in a GFM table row, ignoring the optional outer pipes. */
function columns(line: string): number {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body.split("|").length;
}

function isSeparator(line: string): boolean {
  return line.includes("-") && TABLE_SEPARATOR.test(line);
}

/**
 * GFM does not know a table is a table until the delimiter row arrives, so the
 * header renders as a paragraph of raw pipes for a frame or two. Holding the
 * incomplete table back costs nothing and removes that flash.
 */
function holdIncompleteTable(text: string): string {
  const lastBreak = text.lastIndexOf("\n\n");
  const block = lastBreak === -1 ? text : text.slice(lastBreak + 2);
  const lines = block.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0 || !lines.every((line) => TABLE_ROW.test(line))) return text;

  const header = lines[0] ?? "";
  const width = columns(header);
  const complete = lines.slice(1).some((line) => isSeparator(line) && columns(line) === width);
  if (complete) return text;

  return lastBreak === -1 ? "" : text.slice(0, lastBreak + 2);
}

export function renderable(src: string): string {
  const { parsed, pending } = splitForRender(src);
  return holdIncompleteTable(parsed + stabilizeTail(pending));
}
