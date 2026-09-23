import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { COOKIE_NAME, createSessionToken, Session } from "@/lib/auth";
import { findUser } from "@/lib/store";

export async function POST(req: Request) {
  const { username, password } = await req.json();
  const expectPwd = process.env.ADMIN_PASSWORD;
  const secret = process.env.AUTH_SECRET || "change-me";

  let session: Session | null = null;

  if (username === "admin" && expectPwd && password === expectPwd) {
    session = { u: "admin", r: "admin", exp: Date.now() + 30 * 86400_000 };
  } else {
    const u = findUser(String(username || ""));
    if (u && u.password && password === u.password) {
      session = { u: u.username, r: "user", exp: Date.now() + 30 * 86400_000 };
    }
  }

  if (!session) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const token = await createSessionToken(session, secret);
  const res = NextResponse.json({ ok: true, role: session.r });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 86400,
    path: "/",
  });
  return res;
}
