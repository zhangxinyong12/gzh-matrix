// 素材库 API：素材与账号 1-1 绑定（每个号只有自己的素材，无共享库概念，2026-09-18 改版）
//   cover   → 上传即转存为该账号的微信永久素材；content → uploadimg 拿 mmbiz 直链
//             （微信素材 media_id 按公众号隔离，各号只能用各号自己的）
// 生成取图规则（lib/pipeline.ts）：固定封面 > 本号素材库封面随机一张 > 自动生成
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  getAccount,
  updateAccount,
  listAccounts,
  listMaterials,
  getMaterial,
  addMaterial,
  removeMaterial,
  cacheMaterialRef,
} from "@/lib/store";
import { readMaterial, MATERIAL_DIR } from "@/lib/materials";
import { getAccessToken, uploadCover, uploadContentImage, deleteMaterial } from "@/lib/wechat";

const MAX_SIZE = 10 * 1024 * 1024; // 微信永久图片素材上限

const userOf = (req: Request) => req.headers.get("x-gzh-user") || "";
const isAdmin = (req: Request) => req.headers.get("x-gzh-role") === "admin";

/** 权限：素材跟着账号走，admin 或 owner 可操作；账号不存在直接 404 */
function deny(req: Request, accountId: number): { msg: string; status: number } | null {
  if (!accountId) return { msg: "缺少账号", status: 400 };
  const acc = getAccount(accountId);
  if (!acc) return { msg: "账号不存在", status: 404 };
  if (!isAdmin(req) && acc.owner !== userOf(req)) return { msg: "无权操作该账号", status: 403 };
  return null;
}

/** 素材在所属账号下的引用：优先已存 ref，没有则用原图转存并回填（旧共享素材首次使用会走到这里） */
async function materialize(m: NonNullable<ReturnType<typeof getMaterial>>, type: "cover" | "content"): Promise<string> {
  if (m.ref) return m.ref;
  const acc = getAccount(m.account_id)!;
  const token = await getAccessToken(acc);
  const buf = readMaterial(m);
  const ref =
    type === "cover"
      ? await uploadCover(acc, token, buf, m.name)
      : await uploadContentImage(acc, token, buf, m.name);
  cacheMaterialRef(m.id, m.account_id, ref);
  return ref;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = Number(url.searchParams.get("account_id"));
  const denied = deny(req, accountId);
  if (denied) return NextResponse.json({ error: denied.msg }, { status: denied.status });
  const t = url.searchParams.get("type");
  const type = t === "cover" || t === "content" ? t : undefined;
  return NextResponse.json({
    materials: listMaterials(accountId, type),
    custom_cover_media_id: getAccount(accountId)!.custom_cover_media_id,
  });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const accountId = Number(form.get("account_id"));
  const type = String(form.get("type")) === "content" ? "content" : "cover";
  const denied = deny(req, accountId);
  if (denied) return NextResponse.json({ error: denied.msg }, { status: denied.status });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "未收到图片" }, { status: 400 });
  const oversize = files.find((f) => f.size > MAX_SIZE);
  if (oversize) {
    return NextResponse.json({ error: `「${oversize.name}」超过 10MB（微信素材上限）` }, { status: 400 });
  }

  const acc = getAccount(accountId)!;
  const token = await getAccessToken(acc);
  const dir = path.join(MATERIAL_DIR, String(accountId));
  fs.mkdirSync(dir, { recursive: true });

  const added = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const name = f.name || (type === "cover" ? "cover.png" : "img.png");
    // 上传即转存为该号的微信素材（media_id 按号隔离，素材天生跟号走）
    const ref =
      type === "cover"
        ? await uploadCover(acc, token, buf, name)
        : await uploadContentImage(acc, token, buf, name);
    const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${name.replace(/[\\/:*?"<>|]+/g, "_").slice(-80)}`;
    fs.writeFileSync(path.join(dir, fname), buf);
    const m = addMaterial({ account_id: accountId, type, file: fname, name, ref, refs: {} });
    added.push(m);
  }

  // pin=1：往账号上传单张封面时顺带设为该号固定封面
  let pinned = "";
  if (form.get("pin") === "1" && type === "cover" && added.length === 1) {
    pinned = added[0].ref;
    updateAccount({ id: accountId, custom_cover_media_id: pinned });
  }

  const coverCount = listMaterials(accountId, "cover").length;
  return NextResponse.json({
    ok: true,
    msg: pinned
      ? "已上传并设为此号固定封面"
      : type === "cover"
        ? `已加入素材库（本号封面共 ${coverCount} 张），生成时随机选用`
        : `已上传 ${added.length} 张正文配图，写文时可在预览里一键插入`,
    materials: listMaterials(accountId, type),
    custom_cover_media_id: pinned || acc.custom_cover_media_id,
  });
}

export async function PUT(req: Request) {
  const b = await req.json();
  if (b.action === "unpin") {
    const accountId = Number(b.account_id);
    const denied = deny(req, accountId);
    if (denied) return NextResponse.json({ error: denied.msg }, { status: denied.status });
    updateAccount({ id: accountId, custom_cover_media_id: "" });
    return NextResponse.json({ ok: true, msg: "已取消固定，生成时从素材库随机选封面" });
  }
  // pin：把某张封面设为所属账号的固定封面（素材 1-1 绑定，只能固定给自己的号）
  const m = getMaterial(Number(b.id));
  if (!m) return NextResponse.json({ error: "素材不存在" }, { status: 404 });
  const denied = deny(req, m.account_id);
  if (denied) return NextResponse.json({ error: denied.msg }, { status: denied.status });
  if (m.type !== "cover") {
    return NextResponse.json({ error: "只有封面类素材可设为固定封面" }, { status: 400 });
  }
  const ref = await materialize(m, "cover");
  updateAccount({ id: m.account_id, custom_cover_media_id: ref });
  return NextResponse.json({
    ok: true,
    msg: "已设为此号固定封面，之后的文章都用它",
    custom_cover_media_id: ref,
  });
}

export async function DELETE(req: Request) {
  const b = await req.json();
  const m = getMaterial(Number(b.id));
  if (!m) return NextResponse.json({ error: "素材不存在" }, { status: 404 });
  const denied = deny(req, m.account_id);
  if (denied) return NextResponse.json({ error: denied.msg }, { status: denied.status });
  removeMaterial(m.id);
  try {
    fs.unlinkSync(path.join(MATERIAL_DIR, String(m.account_id), m.file));
  } catch {
    // 本地文件缺失不阻断
  }
  // 微信侧清理（best-effort）+ 若所属账号固定了它则同步取消固定
  try {
    if (m.ref) {
      const acc = getAccount(m.account_id);
      if (acc) await deleteMaterial(acc, await getAccessToken(acc), m.ref);
    }
  } catch {
    // 微信侧失败不影响面板操作
  }
  for (const a of listAccounts()) {
    if (a.custom_cover_media_id && a.custom_cover_media_id === m.ref) {
      updateAccount({ id: a.id, custom_cover_media_id: "" });
    }
  }
  return NextResponse.json({
    ok: true,
    msg: m.ref ? "已移除，微信侧素材与本号固定封面已同步清理" : "已从素材库移除",
  });
}
