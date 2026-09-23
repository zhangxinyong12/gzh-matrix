// 文章预览：返回实际推送微信的排版 HTML（旧记录回退 Markdown 原文）
import fs from "fs";
import { NextResponse } from "next/server";
import { getArticle, getAccount } from "@/lib/store";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: Request) {
  const user = req.headers.get("x-gzh-user") || "";
  const isAdmin = req.headers.get("x-gzh-role") === "admin";

  const id = Number(new URL(req.url).searchParams.get("id"));
  const art = getArticle(id);
  if (!art) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  // 归属校验：与列表接口同口径——子用户只能看自己账号的文章
  const acc = getAccount(art.account_id);
  if (!acc || (!isAdmin && acc.owner !== user)) {
    return NextResponse.json({ error: "无权查看该文章" }, { status: 403 });
  }

  if (art.html_path) {
    try {
      return NextResponse.json({
        title: art.title,
        status: art.status,
        kind: "html",
        html: fs.readFileSync(art.html_path, "utf-8"),
      });
    } catch {
      // 文件被清理时落到下面的 md 分支
    }
  }
  if (art.md_path) {
    try {
      const md = fs.readFileSync(art.md_path, "utf-8");
      return NextResponse.json({
        title: art.title,
        status: art.status,
        kind: "md",
        html: `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:15px;line-height:1.9;color:#333;margin:0;">${esc(md)}</pre>`,
        note: "该记录没有排版 HTML（旧记录），显示 Markdown 原文",
      });
    } catch {
      return NextResponse.json({ error: "文章文件已被清理" }, { status: 404 });
    }
  }
  return NextResponse.json({ error: "该记录没有可预览的内容" }, { status: 404 });
}
