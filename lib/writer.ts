// DeepSeek 写作。联网/非联网走两条通道（2026-09-10 实测定型）：
// - 联网（热点文选题）：Anthropic 兼容端点 /anthropic/v1/messages + web_search server tool——
//   V4.1-Flash 只在这里执行服务端搜索；/responses 端点它会静默忽略 web_search（老 V4-Flash 在
//   /responses 上能搜，2026-09-10 随换模型失效，且官方文档从未承诺过该能力）。
//   联网默认模型 deepseek-flash（便宜，且 V4 Pro 9/14 12:00 起降级路由后仍可用）；setting deepseek_model_search 可覆盖。
//   回退方案（若 Anthropic 端点搜索出问题）：deepseek_model_search=deepseek-v4-pro 走 /responses，仅 9/14 中午前有效
// - 非联网（升级文/排版）：/responses 端点（chat/completions 的 tools 只认 function，联网搜索必须走 /responses——
//   这条口径已过时，联网改走 Anthropic 端点了），模型 setting deepseek_model，默认 deepseek-flash
import https from "https";
import { getSetting } from "./store";
import { SYSTEM_PROMPT } from "./defaults";

export interface Citation {
  title: string;
  url: string;
}

interface ResponseItem {
  type: string;
  role?: string;
  content?: { type: string; text?: string; annotations?: unknown[] }[];
}

interface AnthropicBlock {
  type: string;
  text?: string;
  name?: string;
  content?: unknown; // web_search_tool_result 的结果数组 [{type:'web_search_result', title, url}]
}

export interface ChatOptions {
  instructions?: string;   // 覆盖默认 SYSTEM_PROMPT（排版引擎传入 skill 规范）
  webSearch?: boolean;     // 默认 true；排版等本地任务传 false 关闭联网
  temperature?: number;    // 仅非联网通道生效（联网通道思考模式默认开启，不显式传温度）
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high"; // 排版等转换型任务用 low：实测推理 token 22K→2K
}

export interface ChatResult {
  content: string;
  citations: Citation[];
  searchCalls: number; // 本次响应中服务端实际执行的 web_search 次数（0 = 联网没发生）
}

export async function deepseekChat(
  userPrompt: string,
  keyOverride?: string,
  opts: ChatOptions = {}
): Promise<ChatResult> {
  // Key 由调用方（pipeline 按 owner 解析）传入；此处不再读取全局 Key，防止跨人借用
  const key = keyOverride;
  if (!key) throw new Error("未配置 DeepSeek API Key（登录用户在「设置」页配置自己的 Key）");
  return opts.webSearch !== false
    ? searchChat(userPrompt, key, opts)
    : responsesChat(userPrompt, key, opts);
}

/** 联网写作：Anthropic 兼容端点 + web_search server tool（V4.1-Flash 唯一能真搜的通道）。
 *  用原生 https 而非 fetch：Next.js 会包装全局 fetch，实测长请求会被中途掐断（error: terminated），
 *  同样的请求体在 node 直连下稳定复现成功 */
async function searchChat(
  userPrompt: string,
  key: string,
  opts: ChatOptions
): Promise<ChatResult> {
  const model = getSetting("deepseek_model_search") || "deepseek-flash";
  const { status, json } = await httpsJsonPost(
    "https://api.deepseek.com/anthropic/v1/messages",
    {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    {
      model,
      max_tokens: opts.maxOutputTokens ?? 8192,
      system: opts.instructions ?? SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }
  );
  const data = json as {
    type?: string;
    stop_reason?: string;
    error?: { message?: string } | null;
    content?: AnthropicBlock[];
  };
  if (data.error || (status >= 400 && data.type === "error")) {
    throw new Error(`DeepSeek 调用失败: ${data.error?.message || `HTTP ${status}`}`);
  }
  // max_tokens 用尽 = 输出被截断，残稿绝不推送
  if (data.stop_reason === "max_tokens") {
    throw new Error("DeepSeek 输出被截断（max_tokens），本次放弃");
  }
  const texts: string[] = [];
  const citations: Citation[] = [];
  let searchCalls = 0;
  for (const block of data.content || []) {
    if (block.type === "server_tool_use" && block.name === "web_search") searchCalls++;
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content as { title?: string; url?: string }[]) {
        if (r.url || r.title) citations.push({ title: r.title || "", url: r.url || "" });
      }
    }
    if (block.type === "text" && block.text) texts.push(block.text);
  }
  const content = texts.join("\n").trim();
  if (!content) throw new Error("DeepSeek 返回为空");
  return { content, citations: dedupeCitations(citations).slice(0, 10), searchCalls };
}

/** 原生 https 的 JSON POST：绕开 Next.js 对全局 fetch 的包装 */
function httpsJsonPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 300000
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(data) },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          try {
            resolve({ status: res.statusCode || 0, json: JSON.parse(raw) });
          } catch {
            reject(new Error(`DeepSeek 响应解析失败: ${raw.slice(0, 80)}`));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error(`DeepSeek 请求超时（${timeoutMs}ms）`)));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/** 非联网写作（升级文/排版）：/responses 端点 */
async function responsesChat(
  userPrompt: string,
  key: string,
  opts: ChatOptions
): Promise<ChatResult> {
  const model = getSetting("deepseek_model") || "deepseek-flash";
  const res = await fetch("https://api.deepseek.com/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      instructions: opts.instructions ?? SYSTEM_PROMPT,
      input: userPrompt,
      ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
      temperature: opts.temperature ?? 0.8,
      max_output_tokens: opts.maxOutputTokens ?? 8192,
    }),
  });
  const data = (await res.json()) as {
    status?: string;
    incomplete_details?: { reason?: string };
    error?: { message?: string } | null;
    output?: ResponseItem[];
  };
  if (data.error) throw new Error(`DeepSeek 调用失败: ${data.error.message}`);
  if (data.status === "failed") throw new Error("DeepSeek 调用失败: status=failed");
  // incomplete = 输出被截断（通常是 max_output_tokens 用尽），残稿绝不推送
  if (data.status === "incomplete") {
    throw new Error(`DeepSeek 输出被截断（${data.incomplete_details?.reason || "incomplete"}），本次放弃`);
  }

  const texts: string[] = [];
  const citations: Citation[] = [];
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const block of item.content || []) {
      if (block.type === "output_text" && block.text) texts.push(block.text);
      for (const a of block.annotations || []) {
        const o = a as { type?: string; url?: string; title?: string };
        if (o.type === "url_citation" && (o.url || o.title)) {
          citations.push({ title: o.title || "", url: o.url || "" });
        }
      }
    }
  }
  const content = texts.join("\n").trim();
  if (!content) throw new Error("DeepSeek 返回为空");
  return { content, citations: dedupeCitations(citations).slice(0, 10), searchCalls: 0 };
}

function dedupeCitations(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = c.url || c.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 从模型输出中分离 TITLE: 行与正文。
 *  V4.1-Flash 偶发在 TITLE 行前泄漏英文思考草稿（"I'll start by searching..."），
 *  所以在前 5 行里找 TITLE/一级标题行，之前的杂质行直接丢弃 */
export function splitTitleAndBody(raw: string): { title: string; body: string } {
  const lines = raw.split("\n");
  const upto = Math.min(5, lines.length);
  for (let i = 0; i < upto; i++) {
    const m = lines[i].match(/^\s*(?:TITLE[:：]|#\s+)\s*(.+)$/);
    if (m) return { title: m[1].trim(), body: lines.slice(i + 1).join("\n").trim() };
  }
  return { title: "", body: raw.trim() };
}

/** 从正文中剥离 SOURCES: 段（模型按提示词把引用写在文末） */
export function splitSources(body: string): { body: string; sources: Citation[] } {
  const idx = body.lastIndexOf(/\nSOURCES[:：]/.test(body) ? "\nSOURCES" : "\n引用来源");
  const m = body.match(/\n(SOURCES[:：]|引用来源[:：])\s*\n([\s\S]*)$/);
  if (!m) return { body, sources: [] };
  const sources: Citation[] = m[2]
    .split("\n")
    .map((l) => l.replace(/^[-*\s]*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [t, u] = l.split("|").map((s) => s.trim());
      const url = u || (t.match(/https?:\/\/\S+/)?.[0] ?? "");
      return { title: (u ? t : t.replace(/https?:\/\/\S+/, "")).trim(), url };
    })
    .filter((c) => c.url || c.title)
    .slice(0, 10);
  return { body: body.slice(0, m.index).trim(), sources };
}
