import { NextResponse } from "next/server";
import { getSettings, setSetting, getSetting, listUsers } from "@/lib/store";
import { listThemes } from "@/lib/typeset";

const MODEL_KEY = "deepseek_model";
const THEME_KEY = "typeset_theme";
const globalKey = "deepseek_key";
const userKey = (u: string) => `deepseek_key:${u}`;
// 推广期共享：admin 可允许没配自己 Key 的子用户在免费额度内使用全局 Key
const SHARE_ENABLED_KEY = "key_share_enabled";
const SHARE_QUOTA_KEY = "key_share_quota";
const shareUsedKey = (u: string) => `key_share_used:${u}`;
const shareQuota = () => Number(getSetting(SHARE_QUOTA_KEY)) || 30;
// 文章固定结尾：每人一份（名下账号默认用），admin 另可改全系统兜底版
const endingSelfKey = (u: string) => `ending:${u}`;
const ENDING_DEFAULT_KEY = "ending_default";
// Redfox（红狐数据）爆文搜索 Key：仅 admin 配置，全矩阵共用；留空回退 .env 的 REDFOX_API_KEY
const REDFOX_KEY = "redfox_key";

export async function GET(req: Request) {
  const role = req.headers.get("x-gzh-role");
  const me = req.headers.get("x-gzh-user") || "";

  if (role === "admin") {
    const all = getSettings([globalKey, MODEL_KEY, THEME_KEY, SHARE_ENABLED_KEY, SHARE_QUOTA_KEY, endingSelfKey("admin"), ENDING_DEFAULT_KEY, REDFOX_KEY]);
    return NextResponse.json({
      scope: "global",
      deepseek_key: all[globalKey] ? "•••已配置" : "",
      redfox_key: all[REDFOX_KEY] ? "•••已配置" : "",
      deepseek_model: all[MODEL_KEY] || "deepseek-flash",
      typeset_theme: all[THEME_KEY] || "moyu-green",
      themes: listThemes().map((t) => ({ id: t.id, name: t.name, scenes: t.scenes })),
      key_share_enabled: all[SHARE_ENABLED_KEY] === "1",
      key_share_quota: all[SHARE_QUOTA_KEY] || "30",
      key_share_usage: listUsers().map((u) => ({
        username: u.username,
        used: Number(getSetting(shareUsedKey(u.username))) || 0,
      })),
      ending_self: all[endingSelfKey("admin")] || "",
      ending_default: all[ENDING_DEFAULT_KEY] || "",
    });
  }
  // 子用户：只看到自己的 Key + 自己的免费额度 + 自己的结尾
  const own = getSettings([userKey(me), endingSelfKey(me)]);
  const enabled = getSetting(SHARE_ENABLED_KEY) === "1";
  const used = Number(getSetting(shareUsedKey(me))) || 0;
  return NextResponse.json({
    scope: "personal",
    deepseek_key: own[userKey(me)] ? "•••已配置" : "",
    ending_self: own[endingSelfKey(me)] || "",
    share: {
      enabled,
      used,
      quota: shareQuota(),
      available: enabled && used < shareQuota(),
    },
  });
}

export async function PUT(req: Request) {
  const role = req.headers.get("x-gzh-role");
  const me = req.headers.get("x-gzh-user") || "";
  const b = (await req.json()) as Record<string, string>;

  if (role === "admin") {
    if (b.deepseek_key && !b.deepseek_key.startsWith("•••")) setSetting(globalKey, b.deepseek_key);
    if (b.deepseek_model !== undefined) setSetting(MODEL_KEY, b.deepseek_model);
    if (b.typeset_theme !== undefined && listThemes().some((t) => t.id === b.typeset_theme)) {
      setSetting(THEME_KEY, b.typeset_theme);
    }
    if (b.key_share_enabled !== undefined) setSetting(SHARE_ENABLED_KEY, b.key_share_enabled ? "1" : "0");
    if (b.key_share_quota !== undefined && b.key_share_quota !== "") {
      setSetting(SHARE_QUOTA_KEY, String(Number(b.key_share_quota) || 30));
    }
    if (b.ending_self !== undefined) setSetting(endingSelfKey("admin"), b.ending_self.trim());
    if (b.ending_default !== undefined) setSetting(ENDING_DEFAULT_KEY, b.ending_default.trim());
    if (b.redfox_key && !b.redfox_key.startsWith("•••")) setSetting(REDFOX_KEY, b.redfox_key.trim());
  } else {
    if (b.deepseek_key && !b.deepseek_key.startsWith("•••")) setSetting(userKey(me), b.deepseek_key);
    if (b.ending_self !== undefined) setSetting(endingSelfKey(me), b.ending_self.trim());
  }
  return NextResponse.json({ ok: true });
}
