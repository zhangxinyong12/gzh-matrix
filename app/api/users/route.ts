import { NextResponse } from "next/server";
import { listUsers, createUser, deleteUser, updateUser } from "@/lib/store";

export async function GET(req: Request) {
  if (req.headers.get("x-gzh-role") !== "admin") {
    return NextResponse.json({ error: "仅管理员可访问" }, { status: 403 });
  }
  return NextResponse.json(
    listUsers().map((u) => ({
      username: u.username,
      account_count: 0,
      created_at: u.created_at,
    }))
  );
}

export async function POST(req: Request) {
  if (req.headers.get("x-gzh-role") !== "admin") {
    return NextResponse.json({ error: "仅管理员可操作" }, { status: 403 });
  }
  const b = await req.json();
  if (!b.username || !b.password) {
    return NextResponse.json({ error: "用户名和密码必填" }, { status: 400 });
  }
  if (listUsers().some((u) => u.username === b.username)) {
    return NextResponse.json({ error: "用户名已存在" }, { status: 400 });
  }
  createUser({
    username: b.username,
    password: b.password,
    account_ids: [],
    deepseek_key: "",
  });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  if (req.headers.get("x-gzh-role") !== "admin") {
    return NextResponse.json({ error: "仅管理员可操作" }, { status: 403 });
  }
  const b = await req.json();
  const patch: Record<string, unknown> = {};
  if (b.password) patch.password = b.password;
  updateUser(b.username, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (req.headers.get("x-gzh-role") !== "admin") {
    return NextResponse.json({ error: "仅管理员可操作" }, { status: 403 });
  }
  const { username } = await req.json();
  deleteUser(username);
  return NextResponse.json({ ok: true });
}
