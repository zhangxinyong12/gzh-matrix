// 素材缩略图：读本机留存的上传原文件（data/materials/<accountId>/），不回源微信
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getAccount } from "@/lib/store";

const MATERIAL_DIR = path.join(process.cwd(), "data", "materials");
const IMG_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = Number(url.searchParams.get("account_id"));
  const acc = getAccount(accountId);
  if (!acc) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  const user = req.headers.get("x-gzh-user") || "";
  if (req.headers.get("x-gzh-role") !== "admin" && acc.owner !== user) {
    return NextResponse.json({ error: "无权读取" }, { status: 403 });
  }
  // basename 防目录穿越
  const file = path.basename(url.searchParams.get("file") || "");
  const ext = path.extname(file).toLowerCase();
  const p = path.join(MATERIAL_DIR, String(accountId), file);
  if (!file || !IMG_TYPES[ext] || !fs.existsSync(p)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  return new Response(new Uint8Array(fs.readFileSync(p)), {
    headers: { "Content-Type": IMG_TYPES[ext], "Cache-Control": "private, max-age=86400" },
  });
}
