import { NextResponse } from "next/server";
import { listPrompts, ensurePrompt, updatePrompt } from "@/lib/store";
import { DEFAULT_HOTSPOT_PROMPT, DEFAULT_UPGRADE_PROMPT, DEFAULT_INTRO_PROMPT } from "@/lib/defaults";

export async function GET(req: Request) {
  // 登录即可读：子用户自定义账号模板时需要拿到系统模板作底稿（只读，改不了全局）
  ensurePrompt("hotspot", "热点文提示词", DEFAULT_HOTSPOT_PROMPT);
  ensurePrompt("upgrade", "升级文提示词", DEFAULT_UPGRADE_PROMPT);
  ensurePrompt("intro", "置顶名片文提示词", DEFAULT_INTRO_PROMPT);
  return NextResponse.json(listPrompts());
}

export async function PUT(req: Request) {
  if (req.headers.get("x-gzh-role") !== "admin") {
    return NextResponse.json({ error: "仅管理员可操作" }, { status: 403 });
  }
  const b = await req.json();
  updatePrompt(b.id, b.content);
  return NextResponse.json({ ok: true });
}
