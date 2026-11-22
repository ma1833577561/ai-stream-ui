import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderable } from "../engine/markdown";

export interface TurnMeta {
  chars: number;
  attempts: number;
  ms: number;
  aborted: boolean;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  done: boolean;
  meta?: TurnMeta;
}

/**
 * Memoised on the turn object: the transcript maps over turns on every flush,
 * but only the streaming turn gets a new object, so finished messages never
 * re-render while the answer is still arriving.
 */
export const Message = memo(function Message({ turn }: { turn: Turn }) {
  const streaming = turn.role === "assistant" && !turn.done;
  return (
    <article className={`msg msg-${turn.role}`}>
      <div className="msg-head">
        <span className="who">{turn.role === "user" ? "you" : "assistant"}</span>
        {turn.meta ? (
          <span className="meta">
            {turn.meta.chars} 字
            {turn.meta.attempts > 1 ? ` · 重连 ${turn.meta.attempts - 1} 次` : ""}
            {` · ${turn.meta.ms}ms`}
            {turn.meta.aborted ? " · 已中止" : ""}
          </span>
        ) : null}
        {streaming ? <span className="meta meta-live">streaming</span> : null}
      </div>
      <div className="msg-body">
        {turn.role === "user" ? (
          <p className="plain">{turn.text}</p>
        ) : (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {streaming ? renderable(turn.text) : turn.text}
            </ReactMarkdown>
            {streaming ? <span className="caret" aria-hidden="true" /> : null}
          </div>
        )}
      </div>
    </article>
  );
});
