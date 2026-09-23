// 公众号排版引擎：gzh-design skill 的 API 化封装
// skill 本体（SKILL.md + references/ 主题组件库）按以下顺序解析：
//   1. 环境变量 GZH_SKILL_DIR 指定的目录
//   2. 项目旁的活副本 ../.agents/skills/gzh-design（在这里改主题，面板即时生效）
//   3. 项目内兜底副本 ./skills/gzh-design（部署到别处时用）
import fs from "fs";
import path from "path";
import { deepseekChat } from "./writer";

export interface ThemeInfo {
  id: string;      // 英文标识（moyu-green…）
  name: string;    // 中文名（摸鱼绿…）
  color: string;   // 主色描述
  scenes: string;  // 适用场景
  underline: string; // 正文下划线 CSS（theme-index 为单一权威来源）
}

const fileCache = new Map<string, string>();

function skillRoot(): string {
  const candidates = [
    process.env.GZH_SKILL_DIR,
    path.join(process.cwd(), "..", ".agents", "skills", "gzh-design"),
    path.join(process.cwd(), "skills", "gzh-design"),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "SKILL.md"))) return dir;
  }
  throw new Error(`找不到 gzh-design skill 目录（尝试过: ${candidates.join(" ; ")}）`);
}

function readSkill(rel: string): string {
  const hit = fileCache.get(rel);
  if (hit !== undefined) return hit;
  const content = fs.readFileSync(path.join(skillRoot(), rel), "utf-8");
  fileCache.set(rel, content);
  return content;
}

/** 解析 theme-index.md 的注册主题表（单一来源）；解析失败回退内置清单 */
export function listThemes(): ThemeInfo[] {
  const fallback: ThemeInfo[] = [
    { id: "moyu-green", name: "摸鱼绿", color: "#059669", scenes: "教程、测评、清单、工具盘点", underline: "border-bottom:2px solid #A7F3D0;font-weight:600;" },
    { id: "red-white", name: "红白色系", color: "#DC2626", scenes: "深度分析、观点、力量感话题", underline: "border-bottom:2px solid #FECACA;font-weight:600;" },
    { id: "graphite-minimal", name: "石墨极简风", color: "#52525B", scenes: "设计、科技评论、专业观点", underline: "border-bottom:2px solid #52525B;font-weight:600;" },
    { id: "zen-whitespace", name: "留白禅意风", color: "#4A5D52", scenes: "禅意、极简生活、深度随笔", underline: "border-bottom:1.5px solid #B5C8BC;font-weight:500;" },
    { id: "moyu-ticket", name: "摸鱼票据风", color: "#059669", scenes: "测评、工具对比、创意评测", underline: "border-bottom:2px solid #A7F3D0;font-weight:600;" },
    { id: "olive-journal", name: "橄榄手记", color: "#1e1f23", scenes: "内刊手记、深度评测、案例复盘", underline: "border-bottom:2px solid #ed7b2f;font-weight:600;" },
  ];
  try {
    const themes: ThemeInfo[] = [];
    for (const line of readSkill("references/theme-index.md").split("\n")) {
      if (!line.startsWith("|")) continue;
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length < 6 || cells[0] || !cells[1] || cells[1] === "主题") continue;
      const file = cells[4].replace(/`/g, "");
      const m = file.match(/^references\/theme-([\w-]+)\.md$/);
      if (!m) continue;
      themes.push({
        id: m[1],
        name: cells[1],
        color: cells[2],
        scenes: cells[3],
        underline: cells[5].replace(/`/g, ""),
      });
    }
    return themes.length ? themes : fallback;
  } catch {
    return fallback;
  }
}

export function getTheme(id: string): ThemeInfo {
  const t = listThemes().find((t) => t.id === id);
  if (!t) throw new Error(`未知排版主题「${id}」，可用: ${listThemes().map((t) => t.id).join(", ")}`);
  return t;
}

// ---------- 校验（validate_gzh_html.py 的 TS 移植，只保留 ERROR 级 + 输出形态） ----------

const FORBIDDEN: [RegExp, string][] = [
  [/<style[\s>]/i, "<style> 标签会被过滤，样式必须内联"],
  [/<script[\s>]/i, "<script> 标签会被过滤"],
  [/<\/?div[\s>]/i, "<div> 会被改写，请用 <section>"],
  [/<link[\s>]/i, "外部 <link>（CSS/字体）会被过滤"],
  [/\sclass\s*=/i, "class 属性会被剥离"],
  [/\sid\s*=/i, "id 属性会被剥离"],
  [/position\s*:\s*(fixed|absolute|sticky)/i, "position fixed/absolute/sticky 不被支持"],
  [/float\s*:/i, "float 不被支持"],
  [/@media/i, "@media 媒体查询不被支持"],
  [/@keyframes/i, "@keyframes 动画不被支持"],
  [/@import/i, "@import 不被支持"],
  [/display\s*:\s*grid/i, "display:grid 不被支持"],
  [/var\s*\(\s*--/i, "CSS 变量不被支持"],
  [/url\s*\(\s*['"]?https?:\/\/[^)]*\.(woff2?|ttf|otf|eot)/i, "外部字体不被支持"],
];

export function validateTypesetHtml(html: string): string[] {
  const errors: string[] = [];
  for (const [rx, msg] of FORBIDDEN) {
    const hits = html.match(new RegExp(rx.source, rx.flags));
    if (hits) errors.push(`${msg}（命中 ${hits.length} 处）`);
  }
  if (!/^\s*<section[\s>]/.test(html)) errors.push("输出不是以 <section> 开头的正文片段");
  if (!/<\/section>\s*$/.test(html)) errors.push("输出未以 </section> 结尾（可能被截断）");
  if (/<html[\s>]|<!DOCTYPE/i.test(html)) errors.push("包含了文档外壳（html/head/body）");
  if (/<span\s+leaf/gi.test(html) === false) errors.push("全文没有任何 <span leaf> 包裹，粘贴后样式会丢失");
  // Markdown 残留（说明模型输出的是 Markdown 而非 HTML）
  if (/\*\*[^*]+\*\*/.test(html) || /^#{1,3}\s/m.test(html)) errors.push("残留 Markdown 标记（**加粗**/井号标题）");
  return errors;
}

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

// ---------- 排版 ----------

export interface TypesetResult {
  html: string;
  theme: ThemeInfo;
  retried?: boolean;
}

function buildInstructions(theme: ThemeInfo): string {
  const skill = readSkill("SKILL.md");
  const common = readSkill("references/common-components.md");
  const themeLib = readSkill(`references/theme-${theme.id}.md`);
  const index = readSkill("references/theme-index.md");
  return `你是「gzh-design」公众号排版引擎，正在全自动 API 模式下运行：无交互、不提问、不写文件、不生成预览页。主题已由调用方指定为「${theme.name}」，直接使用，不要再选主题。

【输出契约（最高优先级，违反即作废）】
1. 只输出最终 HTML 正文片段本身：以 <section 开头、以 </section> 结尾，中间是完整排版产物。
2. 不输出任何解释、决策说明、标题行；不包 markdown 代码围栏；不包 <!DOCTYPE>/<html>/<head>/<body> 外壳。
3. 平台红线（校验脚本会逐条检查，命中即重做）：样式全部内联 style；禁止 <style>/<script>/<div>/class/id 属性/position:fixed,absolute,sticky/float/@media/@keyframes/@import/display:grid/CSS 变量/外部字体。
4. 所有中文文字节点必须用 <span leaf="">文字</span> 包裹（粘贴到公众号后保持样式的关键）。
5. 转写正文标点一律全角（，。！？：；""''（）），原文直引号当场转换；代码块/行内代码内部保持原样。

以下是必须遵守的 skill 规范与组件库，HTML 一律从组件库取，不要凭记忆手写：

===== SKILL.md（工作流与智能处理规则）=====
${skill}

===== references/theme-index.md（主题索引，下划线 CSS 以此为权威）=====
${index}

===== references/common-components.md（通用增量组件库：代码块/图片/小标题）=====
${common}

===== references/theme-${theme.id}.md（本篇主题「${theme.name}」组件库）=====
${themeLib}`;
}

function buildUserPrompt(md: string, title: string, theme: ThemeInfo, author: string, intro: string): string {
  return `【文章标题】${title}

【账号署名（尾部签名组件必须直接填入这两个值，禁止保留 {{}} 占位——本系统无人值守，没人会替你替换）】
署名：${author}
一句话简介：${intro}

【指定主题】${theme.name}（theme-${theme.id}.md；正文关键词下划线 CSS 用：${theme.underline}）

【待排版 Markdown 原文】
${md}

按 SKILL.md 全自动模式完成排版：判定文章类型 → 按该主题「文章类型→组件组合配方」选组件 → 按模板骨架装配。智能处理规则全部执行：章节自动编号、英文标签、每个正文段落 1–3 个关键词下划线、开头引言关键词高亮、目录精选 3 条、签名区规则（原文末尾已有作者签名段就并入唯一签名区，不要重复生成）。
现在只输出 HTML 片段。`;
}

/**
 * 用 gzh-design skill 把 Markdown 排版成公众号 HTML。
 * 校验不过会带着错误清单自动重试一次；仍不过则抛错（调用方自行兜底）。
 */
export async function typeset(
  md: string,
  opts: { title: string; themeId: string; key: string; author?: string; intro?: string }
): Promise<TypesetResult> {
  const theme = getTheme(opts.themeId);
  const author = (opts.author || "").trim() || "作者";
  const intro = (opts.intro || "").trim() || author;
  const instructions = buildInstructions(theme);
  const ask = buildUserPrompt(md, opts.title, theme, author, intro);
  // 排版是确定性转换任务：关联网、温度压低；reasoning 用 low（实测推理 token 22K→2K，
  // 否则推理先吃满输出预算导致 HTML 截断）；上限给足防长文
  const call = (extra: string) =>
    deepseekChat(ask + extra, opts.key, {
      instructions,
      webSearch: false,
      temperature: 0.3,
      maxOutputTokens: 32768,
      reasoningEffort: "low",
    });

  const first = await call("");
  let html = sanitizePlaceholders(stripFences(first.content), author, intro);
  let errors = validateTypesetHtml(html);
  if (errors.length === 0) return { html, theme };

  const retry = await call(
    `\n\n【你上一次的输出未通过合规校验，问题如下，必须全部修复后重新输出完整 HTML 片段（只输出 HTML）】\n${errors
      .map((e, i) => `${i + 1}. ${e}`)
      .join("\n")}`
  );
  html = sanitizePlaceholders(stripFences(retry.content), author, intro);
  errors = validateTypesetHtml(html);
  if (errors.length) {
    throw new Error(`排版校验两次未通过：${errors.join("；")}`);
  }
  return { html, theme, retried: true };
}

// 无人值守兜底：签名组件的 {{作者名}}/{{简介}} 系占位符本应被模型填掉，
// 一旦残留就原样推进草稿（2026-09-13 实锤过），这里统一用账号信息替换
function sanitizePlaceholders(html: string, author: string, intro: string): string {
  if (!html.includes("{{")) return html;
  return html
    .replace(/{{\s*一句话简介[^}]*}}/g, intro)
    .replace(/{{\s*简介[^}]*}}/g, intro)
    .replace(/{{\s*作者名[^}]*}}/g, author);
}
