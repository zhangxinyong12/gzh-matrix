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

const sample = `> 抖音截流最近又有新变化，圈里都在讨论风控升级。

## 平台在变，逻辑没变

最近两周，抖音对**私信引流**的识别又紧了一档。但截流的底层逻辑从来没变过：**用户在哪里提问，获客就发生在哪里**。

## 三条还能用的打法

### 评论区关键词截流

在同行视频评论区找带着需求提问的用户，这是最稳的口子。

- 只回评不硬导
- 话术里带钩子词

## 工具怎么配合

我们的「万流汇获客」在设计上就是为这套打法服务的：关键词监控、自动筛选、私信触达，一条链路。

---

**我是 daydayago**，软件开发，目前在做的产品是抖音截流工具「万流汇获客」。
这个号只发这个产品的真实进展。想第一时间看到更新，**关注我，别掉队。**
如果你有需求：想**试用软件**回「**密钥**」，想**代理 / 贴牌 / 定制**回「**代理**」 —— 看到就回。`;

const themeId = process.argv[3] || "moyu-green";

async function main(): Promise<void> {
console.log(`\n⏳ 用主题 ${themeId} 调 DeepSeek 排版中…`);
const t0 = Date.now();
try {
  const r = await typeset(sample, { title: "抖音截流风控又升级了？这三条打法还稳", themeId, key });
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
