// Redfox（红狐数据）API 客户端：真实爆文数据喂热点文选题 + 发文前违禁词检查。
// - 微信爆文搜索走优质库端点：sortType 合法值是 _0 相关 / _2 最新 / _4 最热（带下划线），
//   _4 是唯一能按阅读数倒序的（广域库 gzh/data 端点的 _4 不生效且前排多为 0 阅 SEO 号，不用）
// - 抖音涨粉榜 / 小红书低粉爆文是榜单端点，默认返回最近有数据的日期（T-1 ~ T-2）；低粉爆文
//   当天日期常为空，按 T-1 → T-3 回退探测
// - 四个接口共用 admin 在「系统设置」配置的 key（redfox_key），留空回退 .env 的 REDFOX_API_KEY。
//   没配 key / 网络 / 积分不足时所有函数静默返回 null 或空数组——Redfox 是选题增强不是写作依赖，
//   绝不因它阻塞生成管线
import https from "https";
import { getSetting } from "./store";

const HOST = "redfox.hk";

export function redfoxKey(): string {
  return getSetting("redfox_key") || process.env.REDFOX_API_KEY || "";
}

/** 原生 https JSON 请求（绕开 Next.js 对全局 fetch 的包装，风格同 writer.ts）。
 *  限频（4004）等 3s 重试一次；业务 code 取 2000（部分旧文档写 200，实测统一 2000）。 */
function redfoxRequest<T>(method: "GET" | "POST", apiPath: string, body?: unknown): Promise<T> {
  const key = redfoxKey();
  if (!key) return Promise.reject(new Error("未配置 Redfox Key"));
  const attempt = (retry: boolean): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const headers: Record<string, string> = { "X-API-KEY": key, "Content-Type": "application/json" };
      if (data) headers["Content-Length"] = String(Buffer.byteLength(data));
      const req = https.request(
        { hostname: HOST, path: apiPath, method, headers, timeout: 15000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            let json: { code?: number; msg?: string; data?: unknown };
            try {
              json = JSON.parse(raw);
            } catch {
              return reject(new Error(`Redfox 响应解析失败: ${raw.slice(0, 80)}`));
            }
            // 4004 = 操作过于频繁（官方状态码表）；3106 系旧限频码一并兜住
            if ((json.code === 4004 || json.code === 3108) && retry) {
              setTimeout(() => attempt(false).then(resolve, reject), 3000);
              return;
            }
            if (json.code !== 2000 && json.code !== 200) {
              return reject(new Error(`Redfox ${json.code}: ${json.msg || "调用失败"}`));
            }
            resolve(json.data as T);
          });
        }
      );
      req.on("timeout", () => req.destroy(new Error("Redfox 请求超时")));
      req.on("error", reject);
      if (data) req.write(data);
      req.end();
    });
  return attempt(true);
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => Number(v) || 0;

// ---------- 1. 微信爆文搜索（优质库，_4 最热：爆文优先） ----------

export interface ViralArticle {
  title: string;
  author: string;
  readCount: number;
  likeCount: number;
  publishTime: string;
  workUrl: string;
}

export async function redfoxViralArticles(keyword: string, limit = 5): Promise<ViralArticle[] | null> {
  try {
    const data = (await redfoxRequest<{ list?: Record<string, unknown>[] }>("POST", "/story/api/gzhData/searchArticle", {
      keyword,
      offset: 0,
      sortType: "_4",
    })) as { list?: Record<string, unknown>[] };
    return (data?.list || []).slice(0, limit).map((a) => ({
      title: str(a.title),
      author: str(a.author),
      readCount: num(a.readCount),
      likeCount: num(a.likeCount),
      publishTime: str(a.publishTime).slice(0, 10),
      workUrl: str(a.workUrl),
    }));
  } catch {
    return null;
  }
}

// ---------- 2. 抖音涨粉榜（dateType 1=日 2=周 3=月；不传日期默认最近榜单） ----------

export interface DouyinRiseAccount {
  ranking: number;
  nickname: string;
  followerCount: number;
  addFollowerCount: number;
  category: string;
}

export async function redfoxDouyinRiseRank(dateType: 1 | 2 | 3 = 1, limit = 10): Promise<DouyinRiseAccount[] | null> {
  try {
    const data = await redfoxRequest<Record<string, unknown>[]>("POST", "/story/api/dyData/getDyRiseFansRank", {
      dateType,
      source: "gzh-matrix",
    });
    return (Array.isArray(data) ? data : []).slice(0, limit).map((x) => ({
      ranking: num(x.ranking),
      nickname: str(x.nickname),
      followerCount: num(x.followerCount),
      addFollowerCount: num(x.addFollowerCount),
      category: str(x.category),
    }));
  } catch {
    return null;
  }
}

// ---------- 3. 小红书低粉爆文（粉丝 <5000 互动 >500；日期回退到最近有数据的一天） ----------

export interface XhsLowFanNote {
  title: string;
  desc: string;
  fans: number;
  likeCount: string;
  collectCount: string;
  userName: string;
  publicTime: string;
}

export async function redfoxXhsLowtop(limit = 8): Promise<XhsLowFanNote[] | null> {
  for (let back = 1; back <= 3; back++) {
    const d = new Date(Date.now() - back * 86400_000);
    const rankDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    try {
      const data = await redfoxRequest<unknown>(
        "GET",
        `/story/api/cozeSkill/getXhsCozeSkillDataLowFans?rankDate=${rankDate}&category=${encodeURIComponent("综合全部")}&source=gzh-matrix`
      );
      const list = Array.isArray(data) ? data : [];
      if (list.length) {
        return list.slice(0, limit).map((x) => {
          const n = x as Record<string, unknown>;
          return {
            title: str(n.title),
            desc: str(n.desc).slice(0, 60),
            fans: num(n.fans),
            likeCount: str(n.useLikeCount),
            collectCount: str(n.collectedCount),
            userName: str(n.userName),
            publicTime: str(n.publicTime).slice(0, 10),
          };
        });
      }
    } catch {
      return null; // 网络/鉴权类失败直接放弃，不空转 3 天日期
    }
  }
  return null;
}

// ---------- 4. 违禁词检查（公众号/小红书/抖音三平台词库，返回检出词数组） ----------

export async function redfoxBannedWords(content: string, platform = "公众号"): Promise<string[]> {
  try {
    const data = (await redfoxRequest<{ content?: string }>("POST", "/story/api/cozeSkill/sensitiveWordSearch", {
      content,
      platform,
      source: "gzh-matrix",
    })) as { content?: string };
    const marked = data?.content || "";
    return [...new Set([...marked.matchAll(/<span class="(?:banned-word|sensitive-word)">(.*?)<\/span>/g)].map((m) => m[1]))];
  } catch {
    return [];
  }
}

// ---------- 5. 选题弹药组装：三路数据源拼成注入提示词的文本块 ----------

/** 热点文选题弹药：抖音涨粉榜 + 小红书低粉爆文 + 公众号爆文搜索（关键词按内容定位）。
 *  全部失败/没配 key 返回空串，调用方照旧走纯联网检索。 */
export async function redfoxTopicAmmo(keywords: string[] = ["AI获客", "抖音获客", "私域运营"]): Promise<string> {
  const [rise, lowtop, ...virals] = await Promise.all([
    redfoxDouyinRiseRank(1, 8),
    redfoxXhsLowtop(6),
    ...keywords.map((kw) => redfoxViralArticles(kw, 4)),
  ]);
  const sections: string[] = [];
  if (rise?.length) {
    sections.push(
      `【抖音涨粉日榜 TOP${rise.length}（真实数据，可直接引用数字）】\n` +
        rise
          .map((x) => `${x.ranking}. ${x.nickname}${x.category && x.category !== "全部" ? `（${x.category}）` : ""}总粉丝 ${x.followerCount}，昨日涨粉 ${x.addFollowerCount}`)
          .join("\n")
    );
  }
  if (lowtop?.length) {
    sections.push(
      `【小红书低粉爆文（粉丝都低于 5000 却出了高互动笔记——"小号也能爆"的真实案例，可拆解打法）】\n` +
        lowtop.map((x) => `- ${x.title || x.desc}（粉丝 ${x.fans}，赞 ${x.likeCount}，藏 ${x.collectCount}，${x.publicTime}）`).join("\n")
    );
  }
  const viralRows = virals.filter(Boolean) as ViralArticle[][];
  const kwHits = keywords.filter((_, i) => viralRows[i]?.length);
  if (kwHits.length) {
    const parts = keywords
      .map((kw, i) => {
        const rows = viralRows[i] || [];
        if (!rows.length) return null;
        return `按「${kw}」搜到的公众号高阅读文章：\n` + rows.map((a) => `- 《${a.title}》${a.author}，阅读 ${a.readCount}，${a.publishTime}`).join("\n");
      })
      .filter(Boolean);
    if (parts.length) sections.push(`【公众号爆文搜索（优质库，按阅读数排序的真实数据）】\n${parts.join("\n")}`);
  }
  if (!sections.length) return "";
  return sections.join("\n\n") + "\n\n（以上为 Redfox 数据平台采集的真实公开数据，选题优先从这里取材：讲谁在涨粉、什么内容在小号上爆、同行获客文章在写什么；引用数字时保持原文数值，不编造不夸大）";
}
