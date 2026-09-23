// 一次性迁移示例：① admin 个人结尾 = 自定义业务版（各账号保留原结尾）
// ② 面板里的热点文提示词去掉硬编码结尾，改为"结尾由系统统一追加"
// 业务版结尾文案替换成你自己的示例，参考 PROMPTS.md 的「固定结尾」
const BASE = "http://127.0.0.1:8100";

const BUSINESS_ENDING = `以上就是本期的分享。觉得有收获的话，欢迎**点个关注**，更新不迷路。
我在做的产品/服务的真实进展都会发在这个号，想第一时间看到更新，**关注我，别掉队。**
有问题想交流的直接**私信**我，看到都会回。`;

const NEW_ITEM5 = `5. 不要写任何结尾、作者签名、"关注 / 私信 / 回关键词"类引导语——正文讲完自然收束即可，结尾由系统按账号设置统一追加。`;

const j = async (r) => { const d = await r.json(); if (!r.ok) throw new Error(JSON.stringify(d)); return d; };

// login（密码从环境变量读，不硬编码）
if (!process.env.ADMIN_PASSWORD) throw new Error("请先设置 ADMIN_PASSWORD 环境变量");
const loginRes = await fetch(`${BASE}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: process.env.ADMIN_PASSWORD }),
});
const cookie = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
if (!cookie) throw new Error("登录失败，拿不到 cookie");
const H = { "Content-Type": "application/json", cookie };

// ① admin 个人结尾
await j(await fetch(`${BASE}/api/settings`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ ending_self: BUSINESS_ENDING }),
}));
const s = await j(await fetch(`${BASE}/api/settings`, { headers: H }));
console.log("ending_self 已写入:", s.ending_self.includes("关注") ? "自定义版 ✓" : "异常!");
console.log("ending_default(系统兜底):", s.ending_default ? `自定义(${s.ending_default.length}字)` : "空=内置通用版 ✓");

// ② 提示词模板去硬编码结尾
const prompts = await j(await fetch(`${BASE}/api/prompts`, { headers: H }));
const hot = prompts.find((p) => p.type === "hotspot");
if (!hot) throw new Error("找不到 hotspot 提示词");
if (hot.content.includes("固定结尾（一字不改")) {
  const start = hot.content.indexOf("5. 固定结尾（一字不改");
  const end = hot.content.indexOf("【定位与口吻】");
  if (start < 0 || end < 0 || end < start) throw new Error("定位结尾块失败，放弃修改（需人工处理）");
  const updated = hot.content.slice(0, start) + NEW_ITEM5 + "\n\n" + hot.content.slice(end);
  await j(await fetch(`${BASE}/api/prompts`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ id: hot.id, content: updated }),
  }));
  console.log("提示词模板已更新: 硬编码结尾已移除 ✓");
} else if (hot.content.includes("结尾由系统") || hot.content.includes("结尾由系统按账号设置")) {
  console.log("提示词模板已是新版 ✓");
} else {
  console.log("⚠️ 模板中既无旧结尾块也无新标记，请人工到提示词页检查");
}
