// 一次性脚本：子号定位转向（2026-09-18 用户定调）
// 背景诊断：子号全是 09-11 后的新号 0 粉丝，正文每天带产品 + 标题全是「抖音截流获客：」前缀，
// 同质带货矩阵特征太明显，推荐不 给量、阅读为 0。转向：子号 = 纯分享「抖音私域获客运营」，
// 正文不提任何产品，产品只在结尾签名档软性带一句（软文推广）；主号 daydayago 不变。
// 做三件事：
//   1) 共用热点模板：第 4 条"软性带产品"改为按【内容方向】条件执行（主号方向仍要求带→行为不变）；
//      标题规则加第④条：禁矩阵同前缀同句式；补 {FESTIVAL}/{REDFOX_DATA} 占位符对齐仓库默认模板
//   2) 9 个子号写入新 direction（各角度差异化 + 纯分享红线）+ 互不重样的软文结尾
//   3) 校验回读
// 在 siyu 上运行：node scripts/soften-sub-accounts.mjs（读 /etc/gzh-matrix/secret.env 登录 admin）
import fs from "fs";

const BASE = "http://127.0.0.1:8100";
const secretEnv = fs.readFileSync("/etc/gzh-matrix/secret.env", "utf-8");
const pwd = (secretEnv.match(/^ADMIN_PASSWORD=(.*)$/m) || [])[1]?.trim();
if (!pwd) throw new Error("ADMIN_PASSWORD not found in /etc/gzh-matrix/secret.env");

const PURE_SHARE_RULE = "正文纯分享运营干货，全程不提任何产品、不做任何带货——产品只允许出现在系统追加的结尾签名档里。";

const UPDATES = [
  {
    id: 33, // 小土豆：租房/本地房产
    direction: `抖音私域获客的运营经验分享，主打租房、公寓、本地房产这类同城生意：评论区截流话术怎么写、房源内容怎么选题、看房线索的私信怎么承接、真实案例复盘；本地商家矩阵号怎么养。${PURE_SHARE_RULE}`,
    ending: `顺带提一句：我自己在用的获客工具是「万流汇获客」，盯评论区、筛私信这些活基本都是它在跑。想了解的，私信我就行。`,
  },
  {
    id: 35, // 小小：教培/法律
    direction: `教培招生和法律咨询这类强合规行业的抖音私域获客运营分享：合规前提下的评论区与私信获客、首次响应话术、课程与法律服务的线索转化案例复盘、行业新规对获客动作的影响。${PURE_SHARE_RULE}`,
    ending: `另外说一句，我带的号在用的获客软件是「万流汇获客」，私信筛意向这套就是靠它。有想细聊的，评论区见。`,
  },
  {
    id: 42, // Aixir：开发者/AI 自动化
    direction: `AI 与自动化在获客运营里的实战分享：私信自动化怎么搭、工具实测对比、AI 工作流接住抖音线索的完整链路、独立开发者视角的效率打法。${PURE_SHARE_RULE}`,
    ending: `工具方面我目前用的是「万流汇获客」，获客自动化这块的思路它基本都实现了。想交流的私信我。`,
  },
  {
    id: 77, // 少年恰：普通人下班搞
    direction: `一个普通上班族下班搞抖音获客的真实经验分享：零基础起号、内容选题、第一条私信从哪来、时间不多怎么持续更新、每一步的真实进展。${PURE_SHARE_RULE}`,
    ending: `对了，总有人问我哪来的时间搞这些——一半靠工具。我在用的是「万流汇获客」，评论区和私信它帮我盯着。好奇的私信我，看到都会回。`,
  },
  {
    id: 79, // AI-阿满：AI 工具实战
    direction: `用 AI 把抖音获客跑起来的实战分享：AI 工具组合怎么搭、具体操作步骤拆解、意向客户怎么自动筛、小生意的真实获客进展。${PURE_SHARE_RULE}`,
    ending: `**我在用的 AI 获客软件是「万流汇获客」**，上面这套打法就是它在帮我跑。想了解的，**私信我**就行。`,
  },
  {
    id: 89, // 普通人的AI提效指南：零基础视角
    direction: `零技术基础的普通人视角，讲怎么用 AI 和抖音获客给主业或小生意找客户：手把手的工具用法、每一步做到什么程度、新手最容易错的地方、真实结果。${PURE_SHARE_RULE}`,
    ending: `我自己在用的一款叫「万流汇获客」，不用懂技术，装上就能帮我盯抖音的评论和私信。想上手的朋友，私信我聊。`,
  },
  {
    id: 91, // AI获客顶流：实战打法派
    direction: `AI 获客实战打法分享：评论区、私信、直播间三个入口怎么配合、意向筛选条件怎么设、跟进怎么定节奏、同行打法拆解与案例复盘。${PURE_SHARE_RULE}`,
    ending: `文里这套筛意向的做法，我现在就是靠「万流汇获客」跑的。想看它实际怎么干活的，私信我细聊。`,
  },
  {
    id: 125, // 小希：全行业+矩阵
    direction: `各行各业的抖音私域获客运营经验分享【含矩阵】：评论区截流话术、线索私信承接、内容选题打法、真实案例复盘；矩阵账号怎么分工、怎么养、怎么起量。${PURE_SHARE_RULE}`,
    ending: `工具我在用的是「万流汇获客」，手上这些号能同时管过来，它帮了大忙。同行想交流获客和矩阵运营的，私信我。`,
  },
  {
    id: 129, // 小婷：承接转化
    direction: `获客下半场的运营经验分享：客户从抖音加进来之后怎么聊、怎么跟、怎么成单——私信首次回复话术、先筛后聊 SOP、跟进节奏、朋友圈与社群运营、真实转化案例复盘。${PURE_SHARE_RULE}`,
    ending: `获客端我自己用的是「万流汇获客」，人进来之后的承接正好接得上。想把前后两段打通的，私信我。`,
  },
];

const loginRes = await fetch(`${BASE}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: pwd }),
});
const cookie = (loginRes.headers.getSetCookie?.() || [])
  .map((c) => c.split(";")[0])
  .join("; ");
if (!loginRes.ok || !cookie) throw new Error(`login failed: ${loginRes.status}`);

// ---- 1) 热点模板：产品段改条件执行 + 标题防同质 + 补 {FESTIVAL}/{REDFOX_DATA} ----
const prompts = await (await fetch(`${BASE}/api/prompts`, { headers: { Cookie: cookie } })).json();
const hotspot = prompts.find((p) => p.type === "hotspot");
if (!hotspot) throw new Error("hotspot prompt not found");
let content = hotspot.content;
const lines = content.split("\n");
const idx4 = lines.findIndex((l) => l.startsWith("4. 软性带产品"));
if (idx4 >= 0) {
  lines[idx4] =
    "4. 产品段按【内容方向】执行：【内容方向】要求正文带产品的，写一段说明我们的截流工具「万流汇获客」在设计上如何契合这些打法（不硬销，「我们的工具就是这么设计的」级别的自然）；【内容方向】明确正文纯分享、不提产品的，全篇不得出现产品名或任何带货表述，产品只允许出现在系统追加的结尾签名档里";
} else if (!content.includes("产品段按【内容方向】执行")) {
  throw new Error("hotspot prompt: 结构第4条既找不到旧文案也不像已改过，请人工检查");
}
const iTITLE = lines.findIndex((l) => l.startsWith("第一行：TITLE:"));
if (iTITLE >= 0 && !lines[iTITLE].includes("④")) {
  lines[iTITLE] = lines[iTITLE].replace(
    "这种没人点）。",
    "这种没人点）；④矩阵各号标题不得共用同一前缀或同一句式——像「抖音截流获客：」这类固定开头不要连着用，每期换句式起题。"
  );
}
const iDay = lines.findIndex((l) => l.startsWith("今天是 {TODAY}"));
if (iDay >= 0 && !content.includes("{FESTIVAL}")) {
  lines[iDay] = "今天是 {TODAY}。当前营销节点：{FESTIVAL}。";
}
const iStep1 = lines.findIndex((l) => l.startsWith("第一步："));
if (iStep1 >= 0) {
  if (!lines[iStep1].includes("【真实数据弹药】")) {
    lines[iStep1] = lines[iStep1].replace(
      "第一步：",
      "第一步：优先看下方【真实数据弹药】，那是数据平台采集的真实爆款与涨粉数据，从里面挑角度；弹药之外，"
    );
  }
  if (!lines[iStep1].includes("营销节点窗口")) {
    lines[iStep1] += "营销节点窗口内（见上方「当前营销节点」），优先写与节点相关的备战/实战/承接类打法。";
  }
}
if (!content.includes("{REDFOX_DATA}")) {
  const iNing = lines.findIndex((l) => l.startsWith("【宁缺毋滥"));
  if (iNing < 0) throw new Error("hotspot prompt: 找不到【宁缺毋滥】段，{REDFOX_DATA} 插入点缺失");
  lines.splice(iNing, 0, "【真实数据弹药】", "{REDFOX_DATA}", "");
}
content = lines.join("\n");
const putP = await fetch(`${BASE}/api/prompts`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ id: hotspot.id, content }),
});
console.log("PUT hotspot prompt:", putP.status, "new length:", content.length);

// ---- 2) 子号 direction + ending ----
for (const u of UPDATES) {
  const res = await fetch(`${BASE}/api/accounts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(u),
  });
  console.log(`PUT account ${u.id}:`, res.status);
}

// ---- 3) 校验回读 ----
const list = await (await fetch(`${BASE}/api/accounts`, { headers: { Cookie: cookie } })).json();
for (const a of list.filter((x) => UPDATES.some((u) => u.id === x.id))) {
  const okShare = a.direction.includes("全程不提任何产品");
  const ending = a.ending || "";
  const okSoft = ending.includes("万流汇获客") && !ending.includes("「密钥」") && !ending.includes("「代理」") && !ending.includes("「陪跑」");
  console.log(
    `VERIFY ${a.id} ${a.name} | direction纯分享:${okShare} | ending软文:${okSoft} | ${ending.slice(0, 24)}…`
  );
}
const after = await (await fetch(`${BASE}/api/prompts`, { headers: { Cookie: cookie } })).json();
const hp = after.find((p) => p.type === "hotspot");
console.log(
  "VERIFY prompt:",
  "条件产品段:", hp.content.includes("产品段按【内容方向】执行"),
  "| 标题④:", hp.content.includes("④矩阵各号标题"),
  "| {FESTIVAL}:", hp.content.includes("{FESTIVAL}"),
  "| {REDFOX_DATA}:", hp.content.includes("{REDFOX_DATA}")
);
