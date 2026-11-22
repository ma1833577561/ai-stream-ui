import { useEffect, useRef, useState } from "react";

interface ComposerProps {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ busy, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = (): void => {
    const text = value.trim();
    if (text === "" || busy) return;
    onSend(text);
    setValue("");
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={busy ? "正在流式输出…" : "问点什么 · Enter 发送，Shift+Enter 换行"}
        onChange={(event) => setValue(event.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(event) => {
          // Enter during IME composition confirms the candidate, it does not send.
          if (event.key === "Enter" && !event.shiftKey && !composing.current) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {busy ? (
        <button type="button" className="btn btn-stop" onClick={onStop}>
          停止
        </button>
      ) : (
        <button type="submit" className="btn" disabled={value.trim() === ""}>
          发送
        </button>
      )}
    </form>
  );
}
