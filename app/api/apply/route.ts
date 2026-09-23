import { NextResponse } from "next/server";
import {
  createApplication,
  listApplications,
  reviewApplication,
  findApplication,
  listUsers,
  createUser,
} from "@/lib/store";

const USERNAME_RE = /^[\w-]{2,32}$/;

/** 公开：提交注册申请（登录页，无需登录） */
export async function POST(req: Request) {
  const b = (await req.json()) as { username?: string; password?: string; note?: string };
  const username = (b.username || "").trim();
  const password = b.password || "";
  const note = (b.note || "").trim().slice(0, 300);

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "用户名限 2-32 位，仅限字母/数字/下划线/中划线" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }
  if (username === "admin") {
    return NextResponse.json({ error: "该用户名不可用" }, { status: 400 });
  }
  if (listUsers().some((u) => u.username === username) || findApplication(username)) {
    return NextResponse.json({ error: "该用户名已存在或已有申请在审核中" }, { status: 400 });
  }
  createApplication(username, password, note);
  return NextResponse.json({ ok: true, msg: "申请已提交，请联系 wo812570284 审核开通" });
}

const isAdmin = (req: Request) => req.headers.get("x-gzh-role") === "admin";

/** admin：申请列表 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "仅管理员可访问" }, { status: 403 });
  // 待审核在前，其余按时间倒序
  const rows = listApplications();
  rows.sort((a, b) => {
    if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
  return NextResponse.json(rows);
}

/** admin：审核（通过=开通账号，用申请者自己填的用户名密码） */
export async function PUT(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "仅管理员可操作" }, { status: 403 });
  const b = (await req.json()) as { id?: number; action?: "approve" | "reject" };
  const id = Number(b.id);
  const app = listApplications().find((a) => a.id === id);
  if (!app || app.status !== "pending") {
    return NextResponse.json({ error: "申请不存在或已处理" }, { status: 404 });
  }
  if (b.action === "reject") {
    reviewApplication(id, "rejected");
    return NextResponse.json({ ok: true });
  }
  if (b.action !== "approve") {
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  }
  // 通过：同名用户可能已被手动创建
  if (listUsers().some((u) => u.username === app.username)) {
    return NextResponse.json({ error: `用户 ${app.username} 已存在，无法重复开通` }, { status: 400 });
  }
  createUser({
    username: app.username,
    password: app.password,
    account_ids: [],
    deepseek_key: "",
  });
  reviewApplication(id, "approved");
  return NextResponse.json({ ok: true, username: app.username });
}
