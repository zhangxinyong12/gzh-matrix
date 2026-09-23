import { NextResponse } from "next/server";
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccount,
  Account,
} from "@/lib/store";

const SECRET_MASK = "•••";
const userOf = (req: Request) => req.headers.get("x-gzh-user") || "";
const roleOf = (req: Request) => req.headers.get("x-gzh-role");
const isAdmin = (req: Request) => roleOf(req) === "admin";

// 推送时间限定凌晨档：22:00～次日 05:00（与面板下拉一致；定时器按 HH:mm 字符串精确匹配）
function normalizeGenTime(t: unknown): string | null {
  const m = typeof t === "string" && t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59 || hh > 23) return null;
  const inWindow = (hh >= 22 && hh <= 23) || (hh >= 0 && hh <= 4) || (hh === 5 && mm === 0);
  if (!inWindow) return null;
  return `${String(hh).padStart(2, "0")}:${m[2]}`;
}

// 微信后台复制常带首尾空白（前导空格 appid → 微信 40013 invalid appid），字符串字段统一 trim
function trimStrings<T extends object>(b: T): T {
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "string") (b as Record<string, unknown>)[k] = v.trim();
  }
  return b;
}

/** user 只能看到 owner=自己的账号 */
function visibleAccounts(req: Request): Account[] {
  const all = listAccounts();
  if (isAdmin(req)) return all;
  const me = userOf(req);
  return all.filter((a) => a.owner === me).map((a) => ({ ...a, appsecret: SECRET_MASK }));
}

export async function GET(req: Request) {
  return NextResponse.json(visibleAccounts(req));
}

export async function POST(req: Request) {
  const b = trimStrings(await req.json());
  if (!b.name || !b.appid || !b.appsecret) {
    return NextResponse.json({ error: "名称/AppID/AppSecret 必填" }, { status: 400 });
  }
  const genTime = normalizeGenTime(b.gen_time);
  if (!genTime) {
    return NextResponse.json({ error: "推送时间仅可选 22:00～次日 05:00" }, { status: 400 });
  }
  const id = createAccount({ ...b, gen_time: genTime }, userOf(req));
  return NextResponse.json({ id });
}

export async function PUT(req: Request) {
  const b = trimStrings((await req.json()) as Partial<Account> & { id: number });
  const cur = getAccount(b.id);
  if (!cur) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  if (!isAdmin(req) && cur.owner !== userOf(req)) {
    return NextResponse.json({ error: "无权操作该账号" }, { status: 403 });
  }
  // 子用户回传掩码时不覆盖真实密钥；owner 不可转移
  if (!isAdmin(req) || !b.appsecret || b.appsecret === SECRET_MASK) {
    b.appsecret = cur.appsecret;
  }
  if (b.gen_time !== undefined) {
    const genTime = normalizeGenTime(b.gen_time);
    if (!genTime) {
      return NextResponse.json({ error: "推送时间仅可选 22:00～次日 05:00" }, { status: 400 });
    }
    b.gen_time = genTime;
  }
  delete (b as Partial<Account>).owner;
  updateAccount(b);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  const cur = getAccount(Number(id));
  if (!cur) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  if (!isAdmin(req) && cur.owner !== userOf(req)) {
    return NextResponse.json({ error: "无权操作该账号" }, { status: 403 });
  }
  deleteAccount(Number(id));
  return NextResponse.json({ ok: true });
}
