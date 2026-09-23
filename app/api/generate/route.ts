import { NextResponse } from "next/server";
import { generateForAccount } from "@/lib/pipeline";
import { getOwner } from "@/lib/store";

export async function POST(req: Request) {
  const user = req.headers.get("x-gzh-user") || "";
  const { account_id, content, type } = await req.json();
  const owner = getOwner(Number(account_id));

  if (owner !== user && req.headers.get("x-gzh-role") !== "admin") {
    return NextResponse.json({ error: "无权操作该账号" }, { status: 403 });
  }
  const kind = type === "upgrade" || type === "auto" || type === "intro" ? type : "hotspot";
  return NextResponse.json(await generateForAccount(Number(account_id), undefined, content, kind));
}
