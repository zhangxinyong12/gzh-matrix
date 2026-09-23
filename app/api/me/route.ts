import { NextResponse } from "next/server";
import { articlesTotal } from "@/lib/store";

export async function GET(req: Request) {
  const user = req.headers.get("x-gzh-user") || "";
  const role = req.headers.get("x-gzh-role") || "";
  // 累计生成篇数：记录只留 7 天，总数单独记一个数字（总览卡片用）
  return NextResponse.json({ user, role, total_generated: articlesTotal() });
}
