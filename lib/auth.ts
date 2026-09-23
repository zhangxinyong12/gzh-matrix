// 会话签名与校验（Web Crypto，Node/Edge 通用）
const COOKIE = "gzh_auth";

export interface Session {
  u: string; // 用户名
  r: "admin" | "user";
  exp: number;
}

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function b64decode(s: string): string {
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(s: Session, secret: string): Promise<string> {
  const payload = b64encode(JSON.stringify(s));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<Session | null> {
  if (!token || !secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const expect = await hmac(secret, payload);
    if (sig !== expect) return null;
    const s = JSON.parse(b64decode(payload)) as Session;
    if (!s.u || !s.r || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = COOKIE;
