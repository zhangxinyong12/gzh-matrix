// 一次性脚本：给今天（2026-09-15）新增的两个账户写入差异化身份/方向/受众。
// 两个号此前是同一份配置（互相复制、也复制了小希），矩阵会写成同质内容；
// 现在小希主守"全行业截流+矩阵养号"，小婷主守"线索承接与成交转化"，互补不撞车。
// 在 siyu 上运行：node scripts/configure-new-accounts.mjs（读 /etc/gzh-matrix/secret.env 登录 admin）
import fs from "fs";

const BASE = "http://127.0.0.1:8100";
const secretEnv = fs.readFileSync("/etc/gzh-matrix/secret.env", "utf-8");
const pwd = (secretEnv.match(/^ADMIN_PASSWORD=(.*)$/m) || [])[1]?.trim();
if (!pwd) throw new Error("ADMIN_PASSWORD not found in /etc/gzh-matrix/secret.env");

const UPDATES = [
  {
    id: 125,
    name: "小希讲私域-AI获客",
    identity:
      "私域获客操盘手「小希」：常年帮各行各业商家在抖音上找客户，手上管着一批矩阵号，AI 获客已经用进日常操盘",
    direction:
      "各行业的抖音截流获客打法【包含矩阵】：评论区截流话术、线索私信转化、内容打法与真实案例；矩阵账号怎么养、怎么分工起量；「万流汇获客」作为在用的工具自然出现",
    audience:
      "想做私域、想找客户的商家和个体创业者，各行各业缺客源的人",
  },
  {
    id: 129,
    name: "小婷",
    identity:
      "私域转化教练「小婷」：专管获客的下半场——客户从抖音加进来之后怎么聊、怎么跟、怎么成单，帮商家搭私信承接和转化的整套流程",
    direction:
      "线索承接与成交转化：私信首次回复话术、先筛后聊 SOP、跟进节奏、朋友圈与社群运营、真实转化案例；获客端用「万流汇获客」把人接进来，重点讲人进来之后怎么聊成单",
    audience:
      "能拿到线索但转化不动的商家、个体创业者和销售咨询团队——客户加了微信就凉、不会聊不会跟的人",
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

for (const u of UPDATES) {
  const res = await fetch(`${BASE}/api/accounts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(u),
  });
  console.log(`PUT ${u.id} ${u.name}:`, res.status, await res.text());
}

const list = await (await fetch(`${BASE}/api/accounts`, { headers: { Cookie: cookie } })).json();
for (const a of list.filter((x) => [125, 129].includes(x.id))) {
  console.log("VERIFY", a.id, a.name, "|", a.identity.slice(0, 30), "| gen_time:", a.gen_time, "| enabled:", a.enabled);
}
