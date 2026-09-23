// 预览页图片增强：换封面 / 插入正文图片（对已推送草稿做 draft/update）
// 图片经微信接口转存（封面=永久素材，正文=uploadimg 直链），外部图链在公众号里会被过滤所以必须走这两步
import fs from "fs";
import { NextResponse } from "next/server";
import { getArticle, getAccount, getMaterial, cacheMaterialRef } from "@/lib/store";
import { readMaterial } from "@/lib/materials";
import {
  getAccessToken,
  uploadCover,
  uploadContentImage,
  getDraftThumb,
  updateDraft,
} from "@/lib/wechat";

export async function POST(req: Request) {
  const user = req.headers.get("x-gzh-user") || "";
  const isAdmin = req.headers.get("x-gzh-role") === "admin";

  const form = await req.formData();
  const id = Number(form.get("id"));
  const mode = String(form.get("mode") || "");

  const art = getArticle(id);
  if (!art) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  const acc = getAccount(art.account_id);
  if (!acc || (!isAdmin && acc.owner !== user)) {
    return NextResponse.json({ error: "无权操作该文章" }, { status: 403 });
  }
  if (art.status !== "pushed" || !art.media_id) {
    return NextResponse.json({ error: "该文章没有已推送的草稿" }, { status: 400 });
  }
  if (!art.html_path || !fs.existsSync(art.html_path)) {
    return NextResponse.json({ error: "找不到文章排版文件" }, { status: 400 });
  }

  const token = await getAccessToken(acc);
  let html = fs.readFileSync(art.html_path, "utf-8");
  const articleBase = {
    title: art.title,
    author: acc.name.slice(0, 8),
    digest: art.title,
    content: html,
    need_open_comment: 1,
    only_fans_can_comment: 0,
  };

  if (mode === "cover") {
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "未收到封面图片" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const thumb = await uploadCover(acc, token, buf);
    await updateDraft(acc, token, art.media_id, { ...articleBase, thumb_media_id: thumb });
    return NextResponse.json({ ok: true, msg: "封面已更换，草稿箱里即可看到" });
  }

  if (mode === "content") {
    // 素材库直插：传素材 id 数组（素材 1-1 绑定账号，只认本号素材；没有直链的用原图转存并回填）
    let urls: string[] = [];
    const idsRaw = form.get("material_ids");
    if (typeof idsRaw === "string" && idsRaw.trim()) {
      try {
        const arr: unknown = JSON.parse(idsRaw);
        if (Array.isArray(arr)) {
          for (const mid of arr) {
            const m = getMaterial(Number(mid));
            if (!m || m.type !== "content" || m.account_id !== art.account_id) continue;
            let url = m.ref || "";
            if (!url) {
              url = await uploadContentImage(acc, token, readMaterial(m), m.name);
              cacheMaterialRef(m.id, art.account_id, url);
            }
            urls.push(url);
          }
        }
      } catch {
        // 解析失败按无 material_ids 处理，走文件上传
      }
    }
    if (!urls.length) {
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (!files.length) return NextResponse.json({ error: "未收到图片" }, { status: 400 });
      for (const f of files) {
        const buf = Buffer.from(await f.arrayBuffer());
        urls.push(await uploadContentImage(acc, token, buf, f.name || "img.png"));
      }
    }
    // 插到固定结尾分隔线之前（没有分隔线就追加到文末），并回写排版文件让预览/复制保持同步
    const imgs = urls
      .map((u) => `<p style="text-align:center;margin:18px 0;"><img src="${u}" style="max-width:100%;border-radius:6px;"/></p>`)
      .join("\n");
    const pos = html.lastIndexOf("<hr");
    html = pos >= 0 ? html.slice(0, pos) + imgs + "\n" + html.slice(pos) : html + "\n" + imgs;
    fs.writeFileSync(art.html_path, html, "utf-8");
    const thumb = await getDraftThumb(acc, token, art.media_id);
    await updateDraft(acc, token, art.media_id, { ...articleBase, content: html, thumb_media_id: thumb });
    return NextResponse.json({ ok: true, msg: `已插入 ${urls.length} 张图片（结尾之前），草稿已同步` });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
