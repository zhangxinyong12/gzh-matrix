// 批量配置账号示例：给新号写入差异化身份/方向/受众，避免矩阵各号写成同质内容。
// 账号 id/name/identity/direction/audience 全部替换成你自己的——差异化人设互补不撞车，
// 系统提示词与固定结尾会基于这三件套生成各号自己的内容。
// 运行：把 BASE 改成你的面板地址，密码从环境变量读：ADMIN_PASSWORD=xxx node scripts/configure-new-accounts.mjs
const BASE = "http://127.0.0.1:8100";

const UPDATES = [
  {
    id: 1,
    name: "示例号A",
    identity:
      "示例身份A：一句话说清这个人是谁、凭什么聊这个话题（替换成你自己的）",
    direction:
      "示例方向A：这个号主要写什么，包含哪些固定栏目；与示例号B错开角度，互补不撞车（替换成你自己的）",
    audience:
      "示例受众A：写给谁看，他们处在什么阶段、有什么困惑（替换成你自己的）",
  },
  {
    id: 2,
    name: "示例号B",
    identity:
      "示例身份B：与示例号A不同的人设角度，两号互补（替换成你自己的）",
    direction:
      "示例方向B：另一条内容线，与示例号A分工明确（替换成你自己的）",
    audience:
      "示例受众B：另一类目标读者（替换成你自己的）",
  },
];

const pwd = process.env.ADMIN_PASSWORD;
if (!pwd) throw new Error("请先设置 ADMIN_PASSWORD 环境变量");

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
for (const a of list.filter((x) => UPDATES.some((u) => u.id === x.id))) {
  console.log("VERIFY", a.id, a.name, "|", a.identity.slice(0, 30), "| gen_time:", a.gen_time, "| enabled:", a.enabled);
}
