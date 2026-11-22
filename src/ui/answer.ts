/**
 * The script the mock transport streams. Kept as a plain string so the demo has
 * zero network dependencies and the same output on every machine.
 */
export const DEMO_ANSWER = `## 这段回答是流式渲染出来的

你看到的每个字都来自一个**确定性 mock transport**：没有 API key，没有网络请求，同样的 seed 每次给出同样的分片顺序——所以它既能当演示，也能当测试夹具。

### 它做了四件事

1. **增量解析 SSE**：\`SseParser\` 按字节块喂入，处理 \`\\r\\n\`、跨块的事件、多行 \`data:\`，以及被切成两半的 UTF-8 字符。
2. **断线续传**：每次重连都带上"已收到多少字符"的偏移，服务端只补剩下的部分；如果服务端傻乎乎地整段重放，\`mergeChunk\` 会把重叠的尾巴削掉。
3. **不让 Markdown 抖动**：半行不解析，未闭合的 \`**\` 和反引号自动补全，于是粗体从第一个字就是粗的，不会先显示星号再变粗。
4. **把 token 级更新合并成帧**：一条回答可能产生几百个分片，\`DeltaBatcher\` 把它们压到最多每 16ms 触发一次 \`setState\`。

| 问题 | 朴素写法 | 这里的做法 |
| --- | --- | --- |
| 断线 | 从零重来 | 按已收偏移续传 |
| 代码块 | 每来一个字重排 | 块内只增长，不回流 |
| 重渲染 | 每个分片一次 | 每帧最多一次 |

> 引擎在 \`src/engine/\`，全是纯函数和纯类，不依赖 React。React 只负责在 flush 时把字符串放到屏幕上。

\`\`\`ts
const result = await runStream({ transport }, signal);
// result.text      去重之后的答案
// result.received  服务端一共给了多少字符
// result.attempts  重连了几次
\`\`\`

右侧面板里 \`分片 → 帧\` 的比值，就是被合并掉的那部分重渲染。`;
