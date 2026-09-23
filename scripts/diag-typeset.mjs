// 排版截断诊断：直连 DeepSeek /responses，打印 usage/incomplete 明细
// 用法: node scripts/diag-typeset.mjs <KEY> [额外body字段JSON]
import fs from "fs";
import path from "path";

const key = process.argv[2];
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const root = path.join(process.cwd(), "skills", "gzh-design");
const read = (f) => fs.readFileSync(path.join(root, f), "utf-8");

const theme = { id: "moyu-green", name: "摸鱼绿" };
const instructions = `你是「gzh-design」公众号排版引擎，全自动 API 模式。只输出 <section>…</section> 的 HTML 片段，样式内联，所有中文文字节点用 <span leaf=""> 包裹。

===== SKILL.md =====
${read("SKILL.md")}

===== common-components.md =====
${read("references/common-components.md")}

===== theme-moyu-green.md =====
${read("references/theme-moyu-green.md")}`;

const sample = `> 抖音截流最近又有新变化，圈里都在讨论风控升级。

## 平台在变，逻辑没变

最近两周，抖音对**私信引流**的识别又紧了一档。但截流的底层逻辑从来没变过。

## 三条还能用的打法

### 评论区关键词截流

在同行视频评论区找带着需求提问的用户。

- 只回评不硬导
- 话术里带钩子词

## 工具怎么配合

我们的「万流汇获客」在设计上就是为这套打法服务的。

---

**我是 daydayago**，软件开发。想**试用软件**回「**密钥**」 —— 看到就回。`;

const body = {
  model: "deepseek-v4-flash",
  instructions,
  input: `【文章标题】测试\n【指定主题】摸鱼绿\n【待排版 Markdown】\n${sample}\n\n只输出 HTML 片段。`,
  temperature: 0.3,
  max_output_tokens: 32768,
  ...extra,
};

const res = await fetch("https://api.deepseek.com/responses", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify(body),
});
const data = await res.json();
console.log("http_status:", res.status);
console.log("status:", data.status, "| incomplete:", JSON.stringify(data.incomplete_details));
console.log("usage:", JSON.stringify(data.usage));
let text = "";
for (const item of data.output || []) {
  if (item.type !== "message") continue;
  for (const b of item.content || []) if (b.type === "output_text" && b.text) text += b.text;
}
console.log("output_text_chars:", text.length);
console.log("output_head:", JSON.stringify(text.slice(0, 200)));
console.log("output_types:", JSON.stringify((data.output || []).map((o) => o.type)));
