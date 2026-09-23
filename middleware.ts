import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  // 登录页公开注册申请：仅放行 POST，审核接口（GET/PUT）仍需登录
  if (pathname === "/api/apply" && req.method === "POST") return NextResponse.next();

  const secret = process.env.AUTH_SECRET || "change-me";
  const session = await verifySessionToken(req.cookies.get(COOKIE_NAME)?.value || "", secret);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 把会话身份注入请求头，供 API 路由做角色过滤
  const headers = new Headers(req.headers);
  headers.set("x-gzh-user", session.u);
  headers.set("x-gzh-role", session.r);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
