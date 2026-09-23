// 排版引擎冒烟测试：pnpm dlx tsx scripts/smoke-typeset.ts [DEEPSEEK_KEY] [主题id]
// 无 Key 时只验证离线部分（skill 加载/主题解析/校验器）；有 Key 时追加一次真实排版。
import fs from "fs";
import path from "path";
import { listThemes, validateTypesetHtml, typeset } from "../lib/typeset";

const ok = (name: string, pass: boolean, detail = "") =>
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);

// 1. 主题解析（走真实 theme-index.md）
const themes = listThemes();
ok("主题解析", themes.length >= 6, `${themes.length} 套: ${themes.map((t) => t.name).join("、")}`);

// 2. 校验器：坏样例必须报错
const bad = `<div class="wrap"><style>p{}</style><p>测试</p></div>`;
const badErrors = validateTypesetHtml(bad);
ok("校验器拦截坏 HTML", badErrors.length >= 4, badErrors.join("；"));

// 3. 校验器：好样例必须通过
const good = `<section style="margin:0 auto;"><p style="margin:10px 0;"><span leaf="">你好，世界。</span></p></section>`;
ok("校验器放行好 HTML", validateTypesetHtml(good).length === 0);

// 4. 真实排版（可选）
const key = process.argv[2] || process.env.DEEPSEEK_API_KEY || "";
if (!key) {
  console.log("\nℹ️ 未提供 DeepSeek Key，跳过在线排版测试（用法: node scripts/smoke-typeset.ts sk-...）");
  process.exit(0);
}

const sample = `> AI 编程助手最近又有新版本，圈里都在讨论效率跃升。

## 工具在变，方法没变

最近两周，主流 **AI 编程助手**的长上下文能力又上了一个台阶。但用好它的底层逻辑从来没变过：**需求写得越清楚，产出就越接近能直接用**。

## 三条立刻能用的技巧

### 把任务拆小

一次让 AI 改十个文件，不如一个模块一个模块来，这是最稳的节奏。

- 每轮只提一个明确目标
- 改完立刻跑测试验证

## 工具怎么配合

我常用的「示例效率工具」在设计上就是为这套流程服务的：上下文记忆、任务拆解、结果校验，一条链路。

---

以上就是本期的分享。觉得有收获的话，欢迎**点个关注**，更新不迷路；有问题想交流的直接**私信**我，看到都会回。`;

const themeId = process.argv[3] || "moyu-green";

async function main(): Promise<void> {
console.log(`\n⏳ 用主题 ${themeId} 调 DeepSeek 排版中…`);
const t0 = Date.now();
try {
  const r = await typeset(sample, { title: "AI 编程助手又升级了？这三条技巧还稳", themeId, key });
  const out = path.join(process.cwd(), "data", "smoke-typeset-output.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.html, "utf-8");
  ok(
    `真实排版（${r.theme.name}${r.retried ? "，重试后通过" : ""}）`,
    true,
    `${(Date.now() - t0) / 1000 | 0}s，${r.html.length} 字符 → ${out}`
  );
} catch (e) {
  ok("真实排版", false, e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
}

if (key) void main();
else console.log("\nℹ️ 未提供 DeepSeek Key，跳过在线排版测试（用法: pnpm dlx tsx scripts/smoke-typeset.ts sk-... [主题id]）");
