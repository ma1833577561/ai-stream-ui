interface TelemetryProps {
  status: string;
  chars: number;
  chunks: number;
  flushes: number;
  attempts: number;
  ms: number;
}

export function Telemetry({ status, chars, chunks, flushes, attempts, ms }: TelemetryProps) {
  const coalesced = Math.max(0, chunks - flushes);
  const rows: Array<[string, string]> = [
    ["状态", status],
    ["已收字符", String(chars)],
    ["delta 分片", String(chunks)],
    ["渲染帧", String(flushes)],
    ["合并掉", String(coalesced)],
    ["重连次数", attempts > 0 ? String(Math.max(0, attempts - 1)) : "–"],
    ["耗时", ms > 0 ? `${ms}ms` : "–"],
  ];
  return (
    <aside className="telemetry" aria-label="运行时指标">
      <p className="eyebrow">runtime</p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        {chunks > 0 && flushes > 0
          ? `每帧合并 ${(chunks / flushes).toFixed(1)} 个分片`
          : "开始对话后，这里会显示分片与渲染帧的差值。"}
      </p>
    </aside>
  );
}
