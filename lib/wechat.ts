// 微信公众号 API：token / 上传封面 / 推草稿 / 删草稿
const API = "https://api.weixin.qq.com";

interface AccountRow {
  name: string;
  appid: string;
  appsecret: string;
}

const tokenCache = new Map<string, { token: string; expires: number }>();

export async function getAccessToken(acc: AccountRow): Promise<string> {
  const cached = tokenCache.get(acc.appid);
  if (cached && cached.expires > Date.now() + 120_000) return cached.token;
  const res = await fetch(
    `${API}/cgi-bin/token?grant_type=client_credential&appid=${acc.appid}&secret=${acc.appsecret}`
  );
  const data = (await res.json()) as { access_token?: string; errcode?: number; errmsg?: string };
  if (!data.access_token) throw new Error(`获取 access_token 失败: ${data.errcode} ${data.errmsg}`);
  tokenCache.set(acc.appid, { token: data.access_token, expires: Date.now() + 7_000_000 });
  return data.access_token;
}

const COVER_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

export async function uploadCover(acc: AccountRow, token: string, png: Buffer, filename = "cover.png"): Promise<string> {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const form = new FormData();
  form.append(
    "media",
    new Blob([new Uint8Array(png)], { type: COVER_MIME[ext] || "image/png" }),
    filename
  );
  const res = await fetch(
    `${API}/cgi-bin/material/add_material?access_token=${token}&type=image`,
    { method: "POST", body: form }
  );
  const data = (await res.json()) as { media_id?: string; errcode?: number; errmsg?: string };
  if (!data.media_id) throw new Error(`上传封面失败: ${data.errcode} ${data.errmsg}`);
  return data.media_id;
}

/** 删除永久素材（素材库移除封面时调用；失败仅告警——素材可能已被手动清理） */
export async function deleteMaterial(acc: AccountRow, token: string, mediaId: string): Promise<void> {
  const res = await fetch(`${API}/cgi-bin/material/del_material?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
  const data = (await res.json()) as { errcode?: number; errmsg?: string };
  if (data.errcode) console.warn(`[wechat] 删除永久素材失败: ${data.errcode} ${data.errmsg}`);
}

// 正文插图：上传到「图文消息内的图片」（不占素材额度，返回 mmbiz 直链可直接写进 content）
export async function uploadContentImage(
  acc: AccountRow,
  token: string,
  buf: Buffer,
  filename: string
): Promise<string> {
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(buf)]), filename || "img.png");
  const res = await fetch(`${API}/cgi-bin/media/uploadimg?access_token=${token}`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { url?: string; errcode?: number; errmsg?: string };
  if (!data.url) throw new Error(`上传正文图片失败: ${data.errcode} ${data.errmsg}`);
  return data.url;
}

/** 读取已推草稿当前使用的封面 media_id（更新正文时需要原样带回） */
export async function getDraftThumb(acc: AccountRow, token: string, mediaId: string): Promise<string> {
  const res = await fetch(`${API}/cgi-bin/draft/get?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
  const data = (await res.json()) as { news_item?: { thumb_media_id?: string }[] };
  const thumb = data.news_item?.[0]?.thumb_media_id;
  if (!thumb) throw new Error("读取草稿封面失败");
  return thumb;
}

/** 更新已推送的草稿（换封面 / 插图后调用；articles 按微信要求整对象提交） */
export async function updateDraft(
  acc: AccountRow,
  token: string,
  mediaId: string,
  article: {
    title: string;
    author: string;
    digest: string;
    content: string;
    thumb_media_id: string;
    need_open_comment: number;
    only_fans_can_comment: number;
  }
): Promise<void> {
  const res = await fetch(`${API}/cgi-bin/draft/update?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId, index: 0, articles: article }),
  });
  const data = (await res.json()) as { errcode?: number; errmsg?: string };
  if (data.errcode) throw new Error(`更新草稿失败: ${data.errcode} ${data.errmsg}`);
}

export async function addDraft(
  acc: AccountRow,
  token: string,
  opts: { title: string; content: string; thumbMediaId: string; digest: string; author: string }
): Promise<string> {
  const body = {
    articles: [
      {
        title: opts.title.slice(0, 64),
        author: opts.author.slice(0, 8),
        digest: opts.digest.slice(0, 120),
        content: opts.content,
        thumb_media_id: opts.thumbMediaId,
        need_open_comment: 1,
        only_fans_can_comment: 0,
      },
    ],
  };
  const res = await fetch(`${API}/cgi-bin/draft/add?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { media_id?: string; errcode?: number; errmsg?: string };
  if (!data.media_id) throw new Error(`新建草稿失败: ${data.errcode} ${data.errmsg}`);
  return data.media_id;
}
