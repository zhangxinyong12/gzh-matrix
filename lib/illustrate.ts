// SVG 自绘配图（2026-09-18）：没有素材图时系统自己"画"——
//   封面兜底：coverSvg（900×383，替代原 canvas 纯色文字卡，设计感更强）
//   正文题图：inkOpeningSvg（900×400 留白禅意风山水 + 朱砂印章刻账号名，取色自 gzh-design
//             的 zen-whitespace 主题；山形/枝叶/飞鸟按文章种子随机，每篇略有不同）
// SVG → PNG 用 @resvg/resvg-js（预编译二进制）；中文渲染：水墨题图用仓库自带的马善政毛笔楷体
// （assets/fonts/，OFL 开源），封面等走系统 CJK 字体（siyu 已装 fonts-noto-cjk），GZH_FONT_FILE 可覆盖。
import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";

const REPO_BRUSH_FONT = path.join(process.cwd(), "assets", "fonts", "MaShanZheng-Regular.ttf");

const FONT_CANDIDATES = [
  REPO_BRUSH_FONT,
  process.env.GZH_FONT_FILE || "",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "C:/Windows/Fonts/msyhbd.ttc",
  "C:/Windows/Fonts/msyh.ttc",
].filter(Boolean);

// 封面字体：粗黑体（深空科技风）
const COVER_FONT = "Noto Sans CJK SC, Noto Sans CJK JP, WenQuanYi Zen Hei, Microsoft YaHei, PingFang SC, sans-serif";
// 水墨题图字体：毛笔楷体优先（马善政体），回退系统楷体/宋体/黑体
const INK_FONT = "Ma Shan Zheng, KaiTi, STKaiti, Noto Serif SC, SimSun, Noto Sans CJK SC, serif";

function fontFiles(): string[] {
  return FONT_CANDIDATES.filter((f) => {
    try {
      return fs.existsSync(f);
    } catch {
      return false;
    }
  });
}

/** XML 转义（标题里可能带 & < > 引号） */
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 不该出现在行首的标点（CJK 排版惯例） */
const LEAD_PUNCT = "，。、；：？！…·」』）】〉》\"'";

/** 中文按字数硬折行（CJK 无空格），超出部分截断；行首标点挪回上一行行尾（上一行允许超 1 字） */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const t = text.trim();
  const lines: string[] = [];
  for (let i = 0; i < t.length && lines.length < maxLines; i += perLine) {
    lines.push(t.slice(i, i + perLine));
  }
  const truncated = lines.length * perLine < t.length;
  for (let i = 1; i < lines.length; i++) {
    while (lines[i] && LEAD_PUNCT.includes(lines[i][0])) {
      lines[i - 1] += lines[i][0];
      lines[i] = lines[i].slice(1);
    }
  }
  if (truncated && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.slice(0, Math.max(0, perLine - 1)) + "…";
  }
  return lines.filter(Boolean);
}

/** SVG 字符串 → PNG Buffer。渲染失败抛错，由调用方决定兜底 */
export function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: {
      loadSystemFonts: true,
      fontFiles: fontFiles(),
      defaultFontFamily: "Noto Sans CJK SC",
    },
  });
  return Buffer.from(resvg.render().asPng());
}

/** 封面：深空渐变 + 品牌色装饰 + 标题卡（900×383，公众号头条封面比例 2.35:1） */
export function coverSvg(title: string, subtitle: string, sign: string): string {
  const lines = wrap(title, 12, 2);
  const titleEls = lines
    .map(
      (l, i) =>
        `<text x="104" y="${150 + i * 68}" font-family="${COVER_FONT}" font-size="52" font-weight="bold" fill="#ffffff">${esc(l)}</text>`
    )
    .join("\n  ");
  return `<svg width="900" height="383" viewBox="0 0 900 383" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a1a2e"/>
      <stop offset="0.55" stop-color="#241f52"/>
      <stop offset="1" stop-color="#16213e"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e94560"/>
      <stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="900" height="383" fill="url(#bg)"/>
  <circle cx="822" cy="-46" r="190" fill="#4f46e5" opacity="0.16"/>
  <circle cx="880" cy="52" r="86" fill="#8b5cf6" opacity="0.2"/>
  <circle cx="58" cy="372" r="130" fill="#e94560" opacity="0.1"/>
  <circle cx="196" cy="330" r="7" fill="#8b5cf6" opacity="0.5"/>
  <circle cx="740" cy="300" r="5" fill="#e94560" opacity="0.45"/>
  <rect x="66" y="98" width="10" height="${Math.max(60, lines.length * 68 - 16)}" rx="5" fill="url(#acc)"/>
  ${titleEls}
  <text x="104" y="${118 + lines.length * 68}" font-family="${COVER_FONT}" font-size="22" fill="#a5b4fc">${esc(subtitle.slice(0, 30))}</text>
  <text x="836" y="344" text-anchor="end" font-family="${COVER_FONT}" font-size="20" fill="#ffffff" opacity="0.5">${esc(sign.slice(0, 20))}</text>
</svg>`;
}

/** 种子随机数（mulberry32）：同一篇文章种子固定，山形枝叶每篇不同但不闪烁 */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 印章不刻的赛道通用词（刻人名/诨名，不刻赛道词） */
const SEAL_GENERIC = ["获客", "私域", "顶流", "指南", "提效", "运营", "实战", "营销", "日记"];

/** 印章文字：取前两个汉字（先剔掉通用词）；无汉字则取前两位字母数字大写 */
function sealChars(sign: string): [string, string] {
  let cjk = (sign.match(/[\u4e00-\u9fa5]/g) || []).join("");
  for (const w of SEAL_GENERIC) cjk = cjk.split(w).join("");
  if (cjk.length >= 2) return [cjk[0], cjk[1] ?? ""];
  const latin = sign.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  return latin ? [latin[0], latin[1] ?? ""] : ["印", ""];
}

/**
 * 留白禅意风正文题图（900×400）：白底 + 1px 装裱细线 + 淡墨远山三层 + 孤舟飞鸟 + 墨枝 +
 * 朱砂印章（账号名）。配色取自 gzh-design zen-whitespace 主题（墨绿 #4A5D52 点缀）。
 * seed=文章 id，山形/枝叶/飞鸟位置每篇随机微变，避免千篇一律。
 */
export function inkOpeningSvg(seed: number, sign: string): string {
  const r = rng(seed * 7919 + 17);
  const j = (base: number, amp: number) => Math.round(base + (r() - 0.5) * 2 * amp);
  // 三层山的控制点（x 均分，y 带随机起伏）
  const ridge = (ys: number[]) => {
    const step = 900 / (ys.length - 1);
    const pts = ys.map((y0) => ({ x: j(y0, 26), y: j(y0, 14) }));
    let d = `M0,${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` C${i * step - step / 2},${pts[i].y - 26} ${i * step - 20},${pts[i].y + 18} ${i * step},${pts[i].y}`;
    }
    return d + " L900,400 L0,400 Z";
  };
  const farYs = [232, 196, 214, 178, 190, 158, 172, 146];
  const midYs = [282, 248, 262, 232, 252, 224, 240, 220];
  const nearYs = [332, 306, 320, 300, 316, 298];
  const bx = j(640, 90); // 孤舟位置
  const b1x = j(700, 60), b1y = j(112, 16), b2x = j(760, 50), b2y = j(130, 12);
  const [s1, s2] = sealChars(sign);
  return `<svg width="900" height="400" viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8a8a8a" stop-opacity="0.5"/><stop offset="1" stop-color="#f5f4f0" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#555555" stop-opacity="0.62"/><stop offset="1" stop-color="#eeeeee" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="m3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f2f2f" stop-opacity="0.8"/><stop offset="1" stop-color="#777777" stop-opacity="0.15"/>
    </linearGradient>
    <filter id="blur1" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="blur2" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <rect width="900" height="400" fill="#ffffff"/>
  <rect x="14" y="14" width="872" height="372" fill="none" stroke="#e8e8e8" stroke-width="1"/>
  <path d="${ridge(farYs)}" fill="url(#m1)" filter="url(#blur1)"/>
  <path d="${ridge(midYs)}" fill="url(#m2)" filter="url(#blur2)"/>
  <path d="${ridge(nearYs)}" fill="url(#m3)"/>
  <rect x="${j(120, 40)}" y="352" width="${j(250, 60)}" height="3" rx="1.5" fill="#9a9a9a" opacity="0.35"/>
  <rect x="${j(470, 40)}" y="362" width="${j(170, 40)}" height="3" rx="1.5" fill="#9a9a9a" opacity="0.28"/>
  <path d="M${bx},344 q34,12 68,0 l-8,8 q-26,7 -52,0 Z" fill="#2b2b2b" opacity="0.85"/>
  <path d="M${bx + 34},322 l0,20" stroke="#2b2b2b" stroke-width="2" opacity="0.8"/>
  <path d="M${bx + 34},322 l14,16 l-14,2 Z" fill="#2b2b2b" opacity="0.75"/>
  <path d="M${b1x},${b1y} q9,-9 18,0 q9,-9 18,0" fill="none" stroke="#4a4a4a" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M${b2x},${b2y} q7,-7 14,0 q7,-7 14,0" fill="none" stroke="#4a4a4a" stroke-width="2" stroke-linecap="round"/>
  <path d="M900,40 C840,58 800,52 760,84 C740,100 722,104 706,102" fill="none" stroke="#2b2b2b" stroke-width="3.4" stroke-linecap="round"/>
  <ellipse cx="794" cy="108" rx="13" ry="5.5" fill="#3d5046" opacity="0.85" transform="rotate(-32 794 108)"/>
  <ellipse cx="760" cy="96" rx="12" ry="5" fill="#3d5046" opacity="0.7" transform="rotate(24 760 96)"/>
  <ellipse cx="736" cy="108" rx="11" ry="4.6" fill="#4a5d52" opacity="0.8" transform="rotate(-18 736 108)"/>
  <rect x="76" y="300" width="56" height="56" rx="5" fill="#9e3f33"/>
  <text x="104" y="322" text-anchor="middle" font-family="${INK_FONT}" font-size="21" fill="#ffffff">${esc(s1)}</text>
  <text x="104" y="347" text-anchor="middle" font-family="${INK_FONT}" font-size="21" fill="#ffffff">${esc(s2)}</text>
</svg>`;
}
