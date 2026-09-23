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

const sample = `> AI 编程助手最近又有新版本，圈里都在讨论效率跃升。

## 工具在变，方法没变

最近两周，主流 **AI 编程助手**的长上下文能力又上了一个台阶。但用好它的底层逻辑从来没变过。

## 三条立刻能用的技巧

### 把任务拆小

一次让 AI 改十个文件，不如一个模块一个模块来。

- 每轮只提一个明确目标
- 改完立刻跑测试验证

## 工具怎么配合

我常用的「示例效率工具」在设计上就是为这套流程服务的。

---

以上就是本期的分享。觉得有收获的话，欢迎**点个关注**，更新不迷路。`;

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
