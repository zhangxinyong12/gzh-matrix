// JSON 文件存储：数据量小（个位数账号、百条记录），零原生依赖，稳定优先
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export interface Account {
  id: number;
  name: string;
  appid: string;
  appsecret: string;
  owner: string; // 创建者用户名（admin / 子用户）
  role: "main" | "sub";
  identity: string;   // 身份（必填）
  direction: string;  // 内容方向（必填）
  audience: string;   // 受众人群（必填）
  ideas: string;      // 主号的想法/素材（选填）
  ending: string;     // 固定结尾（留空用默认）
  follow_system: number;  // 1=跟随系统写作口径（全局提示词）；0=用本账号自定义模板（仅 promo=1 时有意义）
  promo: number;          // 1=内置推广口径（默认，矩阵营销体系：系统提示词/固定结尾/品牌封面）；0=独立写作模式（自带整份提示词，系统不强加任何内置口径）
  hotspot_prompt: string; // 自定义热点文模板（follow_system=0 且非空时生效；promo=0 时=整篇提示词，非空即整篇生效）
  upgrade_prompt: string; // 自定义升级文模板（follow_system=0 且非空时生效；promo=0 时不可用）
  custom_cover_media_id: string; // 固定封面（永久素材 media_id，非空则每篇都用它，不再自动生成）
  gen_time: string;
  enabled: number;
  created_at: string;
}
export interface Prompt {
  id: number;
  type: string;
  name: string;
  content: string;
  updated_at: string;
}

// 素材库：图片素材，与账号 1-1 绑定（每个号只有自己的素材，不再有共享库概念，2026-09-18 改版）
// 微信素材 media_id 按公众号隔离：上传时即转存为所属账号的微信素材，ref 就是该号的引用
export interface Material {
  id: number;
  account_id: number; // 所属账号（唯一归属；旧共享库 account_id=0 的数据由 load() 自动迁给主号）
  type: "cover" | "content"; // cover=封面（生成时可随机/固定取用）；content=正文配图（uploadimg 直链可写进正文）
  file: string; // 本地文件名（data/materials/<accountId>/ 下，面板缩略图用）
  name: string; // 上传时的原始文件名
  ref: string;  // 所属账号的引用（cover=media_id / content=mmbiz 直链）；旧共享素材首次使用时懒转存后回填
  refs?: Record<string, string>; // ⚠️ 旧共享库时代的按号引用缓存，仅存量数据保留，新逻辑不再读写
  added_at: string;
}
export interface Article {
  id: number;
  account_id: number;
  title: string;
  md_path: string;
  html_path: string; // 排版产物（实际推送微信的 HTML），预览用
  media_id: string;
  status: string;
  source_type: string;
  sources_json: string;
  error: string;
  created_at: string;
}

interface StoreShape {
  seq: number;
  accounts: Account[];
  prompts: Prompt[];
  articles: Article[];
  materials: Material[];
  settings: Record<string, string>;
  users: SubUser[];
  applications: ApplyApplication[];
}

// ⚠️ 缓存必须挂 globalThis：Next.js 会给 instrumentation（cron/队列）和 API 路由各自独立的
// 模块实例，模块级变量会分裂成两份缓存——夜间队列写入的记录会被 API 侧的旧缓存覆盖丢失。
const g = globalThis as unknown as { __gzhStoreCache?: StoreShape };

function load(): StoreShape {
  if (g.__gzhStoreCache) return g.__gzhStoreCache;
  try {
    g.__gzhStoreCache = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    g.__gzhStoreCache = { seq: 0, accounts: [], prompts: [], articles: [], materials: [], settings: {}, users: [], applications: [] };
  }
  // 兼容旧版本数据文件：缺失字段兜底
  const c = g.__gzhStoreCache!;
  c.users ??= [];
  c.accounts ??= [];
  c.prompts ??= [];
  c.articles ??= [];
  c.materials ??= [];
  c.settings ??= {};
  c.applications ??= [];
  // 素材库共享缓存字段兜底（旧数据遗留，新逻辑只读写 ref）
  for (const m of c.materials) m.refs ??= {};
  // 素材 1-1 绑定账号（2026-09-18 改版）：旧共享库素材（account_id=0）整体划归主号，
  // 本地原图同步从 materials/0/ 挪进主号目录，否则缩略图 404、转存找不到文件
  if (c.materials.some((m) => m.account_id === 0) && c.accounts.length) {
    const host =
      c.accounts.find((a) => a.role === "main" && a.owner === "admin") ||
      c.accounts.find((a) => a.role === "main") ||
      c.accounts[0];
    const dir0 = path.join(process.cwd(), "data", "materials", "0");
    const dirHost = path.join(process.cwd(), "data", "materials", String(host.id));
    for (const m of c.materials) {
      if (m.account_id !== 0) continue;
      m.account_id = host.id;
      try {
        if (fs.existsSync(path.join(dir0, m.file))) {
          fs.mkdirSync(dirHost, { recursive: true });
          fs.renameSync(path.join(dir0, m.file), path.join(dirHost, m.file));
        }
      } catch {
        // 原图挪动失败不阻断启动：记录已归号，最坏是缩略图 404
      }
    }
    save();
  }
  // 账号自定义口径字段兜底（旧数据 = 跟随系统）
  for (const a of c.accounts) {
    a.follow_system ??= 1;
    a.promo ??= 1;
    a.hotspot_prompt ??= "";
    a.upgrade_prompt ??= "";
    a.custom_cover_media_id ??= "";
  }
  return c;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

function nextId(): number {
  return ++load().seq;
}

// ---------- accounts ----------
export const listAccounts = () => load().accounts;
export function getAccount(id: number): Account | undefined {
  return load().accounts.find((a) => a.id === id);
}
export const getOwner = (id: number) => getAccount(id)?.owner;
export function createAccount(b: Partial<Account>, owner: string): number {
  const s = load();
  const acc: Account = {
    id: nextId(),
    name: b.name || "",
    appid: b.appid || "",
    appsecret: b.appsecret || "",
    owner,
    role: (b.role as Account["role"]) || "sub",
    identity: b.identity || "",
    direction: b.direction || "",
    audience: b.audience || "",
    ideas: b.ideas || "",
    ending: b.ending || "",
    follow_system: b.follow_system === 0 ? 0 : 1,
    promo: b.promo === 0 ? 0 : 1,
    hotspot_prompt: b.hotspot_prompt || "",
    upgrade_prompt: b.upgrade_prompt || "",
    custom_cover_media_id: b.custom_cover_media_id || "",
    gen_time: b.gen_time || "23:30",
    enabled: b.enabled ? 1 : 0,
    created_at: new Date().toISOString(),
  };
  s.accounts.push(acc);
  save();
  return acc.id;
}
export function updateAccount(b: Partial<Account>): void {
  const s = load();
  const i = s.accounts.findIndex((a) => a.id === b.id);
  if (i >= 0) s.accounts[i] = { ...s.accounts[i], ...b } as Account;
  save();
}
export function deleteAccount(id: number): void {
  const s = load();
  s.accounts = s.accounts.filter((a) => a.id !== id);
  save();
}

// ---------- prompts ----------
export function listPrompts(): Prompt[] {
  return load().prompts;
}
export function ensurePrompt(type: string, name: string, content: string): void {
  const s = load();
  if (!s.prompts.find((p) => p.type === type)) {
    s.prompts.push({ id: nextId(), type, name, content, updated_at: new Date().toISOString() });
    save();
  }
}
export function updatePrompt(id: number, content: string): void {
  const s = load();
  const p = s.prompts.find((p) => p.id === id);
  if (p) {
    p.content = content;
    p.updated_at = new Date().toISOString();
    save();
  }
}
export function getPromptByType(type: string): Prompt | undefined {
  return load().prompts.find((p) => p.type === type);
}

// ---------- articles ----------
export const listArticles = () => load().articles.slice(-100).reverse();
export function getArticle(id: number): Article | undefined {
  return load().articles.find((a) => a.id === id);
}export function addArticle(
  accountId: number,
  title: string,
  status = "generating",
  sourceType = "hotspot"
): number {
  const s = load();
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const a: Article = {
    id: nextId(),
    account_id: accountId,
    title,
    md_path: "",
    html_path: "",
    media_id: "",
    status,
    source_type: sourceType,
    sources_json: "",
    error: "",
    created_at: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`,
  };
  s.articles.push(a);
  save();
  return a.id;
}
export function updateArticle(id: number, patch: Partial<Article>): void {
  const s = load();
  const a = s.articles.find((a) => a.id === id);
  if (a) Object.assign(a, patch);
  save();
}

export const ARTICLES_KEEP_DAYS = 7; // 生成记录只留 7 天：文章已推草稿箱，本地无需久存，总数走 articles_total 计数

/** 清理超过 keepDays 的生成记录（含本地 md/html，仍被保留记录引用的路径跳过），返回清理条数 */
export function pruneArticles(keepDays = ARTICLES_KEEP_DAYS): number {
  const s = load();
  const d = new Date(Date.now() - keepDays * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const cutoff =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  const gone = s.articles.filter((a) => a.created_at && a.created_at < cutoff);
  if (!gone.length) return 0;
  s.articles = s.articles.filter((a) => !(a.created_at && a.created_at < cutoff));
  save();
  const alive = new Set(s.articles.flatMap((a) => [a.md_path, a.html_path]).filter(Boolean));
  for (const a of gone) {
    for (const f of [a.md_path, a.html_path]) {
      if (f && !alive.has(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // 文件可能已被手动清理
        }
      }
    }
  }
  return gone.length;
}

/** 累计生成计数：记录 7 天滚动清理，总数单独记一个数字 */
export function bumpArticlesTotal(): number {
  const s = load();
  const n = (Number(s.settings["articles_total"]) || 0) + 1;
  s.settings["articles_total"] = String(n);
  save();
  return n;
}
export const articlesTotal = (): number => Number(load().settings["articles_total"]) || 0;

// ---------- materials（素材库：与账号 1-1 绑定，封面 / 正文配图） ----------
export const listMaterials = (accountId: number, type?: Material["type"]): Material[] =>
  load().materials.filter((m) => m.account_id === accountId && (!type || m.type === type));
export const getMaterial = (id: number): Material | undefined =>
  load().materials.find((m) => m.id === id);
export function addMaterial(b: Omit<Material, "id" | "added_at">): Material {
  const s = load();
  const m: Material = { ...b, id: nextId(), added_at: new Date().toISOString() };
  s.materials.push(m);
  save();
  return m;
}
/** 记录素材在某账号下的微信引用（共享素材懒转存后调用） */
export function cacheMaterialRef(id: number, _accountId: number, ref: string): void {
  const m = load().materials.find((x) => x.id === id);
  if (m) {
    m.ref = ref; // 1-1 绑定后引用只属于所属账号，直接回填 ref
    save();
  }
}
/** 移除素材记录，返回被删条目（调用方负责清理本地文件与微信素材） */
export function removeMaterial(id: number): Material | undefined {
  const s = load();
  const i = s.materials.findIndex((m) => m.id === id);
  if (i < 0) return undefined;
  const [m] = s.materials.splice(i, 1);
  save();
  return m;
}

// ---------- settings ----------
export function getSetting(key: string): string | undefined {
  return load().settings[key];
}
export function getSettings(keys: string[]): Record<string, string> {
  const s = load();
  const out: Record<string, string> = {};
  for (const k of keys) if (s.settings[k] !== undefined) out[k] = s.settings[k];
  return out;
}
export function setSetting(key: string, value: string): void {
  load().settings[key] = value;
  save();
}

// ---------- users（子用户：root 创建，只能看分配给自己的账号） ----------
export interface SubUser {
  username: string;
  password: string;
  account_ids: number[];
  deepseek_key: string; // 该用户自己的 DeepSeek Key（隔离计费）
  created_at: string;
}

export const listUsers = () => load().users;
export function findUser(username: string): SubUser | undefined {
  return load().users.find((u) => u.username === username);
}
export function createUser(u: Omit<SubUser, "created_at">): void {
  load().users.push({ ...u, created_at: new Date().toISOString() });
  save();
}
export function updateUser(username: string, patch: Partial<SubUser>): void {
  const s = load();
  const u = s.users.find((u) => u.username === username);
  if (u) {
    Object.assign(u, patch);
    save();
  }
}

// ---------- applications（登录页公开申请，admin 审核后开通） ----------
export type ApplyStatus = "pending" | "approved" | "rejected";
export interface ApplyApplication {
  id: number;
  username: string;
  password: string; // 申请者自己填的初始密码
  note: string;     // 备注（用途/从哪里看到的等）
  status: ApplyStatus;
  created_at: string;
  reviewed_at: string;
}
export const listApplications = () => load().applications;
export function findApplication(username: string): ApplyApplication | undefined {
  return load().applications.find((a) => a.username === username && a.status === "pending");
}
export function createApplication(username: string, password: string, note: string): number {
  const s = load();
  const id = nextId();
  s.applications.push({
    id,
    username,
    password,
    note,
    status: "pending",
    created_at: new Date().toISOString(),
    reviewed_at: "",
  });
  save();
  return id;
}
export function reviewApplication(id: number, status: Exclude<ApplyStatus, "pending">): void {
  const s = load();
  const a = s.applications.find((x) => x.id === id);
  if (a) {
    a.status = status;
    a.reviewed_at = new Date().toISOString();
    save();
  }
}
export function findUserByAccount(accountId: number): SubUser | undefined {
  return load().users.find((u) => u.account_ids.includes(accountId));
}
export function deleteUser(username: string): void {
  const s = load();
  s.users = s.users.filter((u) => u.username !== username);
  save();
}
