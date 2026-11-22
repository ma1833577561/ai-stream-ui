import { useCallback, useEffect, useRef, useState } from "react";
import { DeltaBatcher } from "../engine/scheduler";
import { runStream, type StreamStatus } from "../engine/stream";
import { createMockTransport } from "../transport/mock";
import { Composer } from "./Composer";
import { Message, type Turn } from "./Message";
import { Telemetry } from "./Telemetry";
import { DEMO_ANSWER } from "./answer";
import { bottomTarget, isNearBottom } from "./scrollMath";

type ChatStatus = "idle" | StreamStatus;

const STATUS_LABEL: Record<ChatStatus, string> = {
  idle: "idle",
  connecting: "connecting",
  streaming: "streaming",
  retrying: "retrying",
  done: "done",
  aborted: "aborted",
  error: "error",
};

const SUGGESTIONS = [
  "断线之后是怎么接着写的？",
  "为什么不用 EventSource？",
  "Markdown 为什么不会闪？",
];

interface Stats {
  chars: number;
  chunks: number;
  flushes: number;
  attempts: number;
  ms: number;
}

const EMPTY_STATS: Stats = { chars: 0, chunks: 0, flushes: 0, attempts: 0, ms: 0 };

export function App() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [simulateDrop, setSimulateDrop] = useState(true);
  const [showJump, setShowJump] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickRef = useRef(true);
  const busyRef = useRef(false);
  const seqRef = useRef(0);

  const busy = status === "connecting" || status === "streaming" || status === "retrying";

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const prompt = raw.trim();
      if (prompt === "" || busyRef.current) return;
      busyRef.current = true;

      seqRef.current += 2;
      const userId = `u${seqRef.current}`;
      const assistantId = `a${seqRef.current + 1}`;

      setTurns((prev) => [
        ...prev,
        { id: userId, role: "user", text: prompt, done: true },
        { id: assistantId, role: "assistant", text: "", done: false },
      ]);
      setStatus("connecting");
      setStats(EMPTY_STATS);
      stickRef.current = true;
      setShowJump(false);

      const controller = new AbortController();
      abortRef.current = controller;
      const startedAt = performance.now();

      let chars = 0;
      let chunks = 0;
      let flushes = 0;
      let attempts = 0;

      const batcher = new DeltaBatcher({
        intervalMs: 16,
        onFlush: (chunk) => {
          flushes += 1;
          setTurns((prev) =>
            prev.map((turn) => (turn.id === assistantId ? { ...turn, text: turn.text + chunk } : turn)),
          );
          setStats({
            chars,
            chunks,
            flushes,
            attempts,
            ms: Math.round(performance.now() - startedAt),
          });
        },
      });

      const transport = createMockTransport({
        script: DEMO_ANSWER,
        delayMs: 55,
        dropAt: simulateDrop ? Math.floor(DEMO_ANSWER.length * 0.55) : null,
      });

      const result = await runStream(
        {
          transport,
          sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
          onStatus: (next) => {
            if (next === "retrying") attempts += 1;
            setStatus(next);
          },
          onDelta: (chunk) => {
            chunks += 1;
            chars += chunk.length;
            batcher.push(chunk);
          },
        },
        controller.signal,
      );

      batcher.flushNow();
      batcher.dispose();

      const ms = Math.round(performance.now() - startedAt);
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantId
            ? {
                ...turn,
                text: result.text,
                done: true,
                meta: { chars: result.text.length, attempts: result.attempts, ms, aborted: result.aborted },
              }
            : turn,
        ),
      );
      setStats({ chars: result.text.length, chunks, flushes, attempts: result.attempts, ms });
      setStatus(result.aborted ? "aborted" : result.error ? "error" : "done");
      abortRef.current = null;
      busyRef.current = false;
    },
    [simulateDrop],
  );

  // `?autoplay` runs one answer on load: handy for screenshots, embeds and
  // for checking the whole pipeline without touching the keyboard.
  const autoplayed = useRef(false);
  useEffect(() => {
    if (autoplayed.current) return;
    autoplayed.current = true;
    if (!new URLSearchParams(window.location.search).has("autoplay")) return;
    void send(SUGGESTIONS[0] ?? "讲一下这个流式实现");
  }, [send]);

  const lastText = turns.length > 0 ? (turns[turns.length - 1]?.text ?? "") : "";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = bottomTarget({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  }, [lastText, turns.length]);

  const handleScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    stickRef.current = near;
    setShowJump(!near);
  };

  const jumpToLatest = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-copy">
          <p className="eyebrow">ai-stream-ui · local demo</p>
          <h1>
            流式回答，<em>不抖</em>的那种
          </h1>
          <p className="lede">
            增量 SSE 解析、断线续传、Markdown 增量渲染。内置确定性 mock transport，
            不需要 API key，也能静态部署。
          </p>
        </div>
        <div className="masthead-side">
          <label className="toggle">
            <input
              type="checkbox"
              checked={simulateDrop}
              onChange={(event) => setSimulateDrop(event.target.checked)}
            />
            <span>模拟中途断线</span>
          </label>
          <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
        </div>
      </header>

      <div className="layout">
        <main className="stage">
          <div className="transcript" ref={scrollRef} onScroll={handleScroll}>
            {turns.length === 0 ? (
              <div className="empty">
                <p className="empty-title">还没有对话。</p>
                <p className="empty-copy">
                  选一个问题，或者直接输入。所有内容都是本地生成的——看的是渲染和传输的行为，不是模型的质量。
                </p>
                <div className="chips">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="chip"
                      onClick={() => {
                        void send(suggestion);
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn) => <Message key={turn.id} turn={turn} />)
            )}
          </div>

          {showJump ? (
            <button type="button" className="jump" onClick={jumpToLatest}>
              ↓ 回到最新
            </button>
          ) : null}

          <Composer busy={busy} onSend={send} onStop={stop} />
        </main>

        <Telemetry
          status={STATUS_LABEL[status]}
          chars={stats.chars}
          chunks={stats.chunks}
          flushes={stats.flushes}
          attempts={stats.attempts}
          ms={stats.ms}
        />
      </div>

      <footer className="footnote">
        <span>
          <code>src/engine/</code> 不依赖 React · 测试覆盖分片、续传、增量渲染
        </span>
        <span>React 18 · TypeScript strict · Vite</span>
      </footer>
    </div>
  );
}
