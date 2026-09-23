// 生成管线：DeepSeek 联网搜热点 → 写作 → 封面 → 推草稿 → 落库
import fs from "fs";
import path from "path";
import {
  addArticle,
  updateArticle,
  getAccount,
  listArticles,
  getPromptByType,
  getSetting,
  setSetting,
  bumpArticlesTotal,
  listMaterials,
  cacheMaterialRef,
  Account,
} from "./store";
import { readMaterial } from "./materials";
import { deepseekChat, splitTitleAndBody, splitSources, Citation } from "./writer";
import { redfoxTopicAmmo, redfoxBannedWords } from "./redfox";
import { generateCover } from "./cover";
import { getAccessToken, uploadCover, uploadContentImage, addDraft } from "./wechat";
import { coverSvg, inkOpeningSvg, svgToPng } from "./illustrate";
import { DEFAULT_HOTSPOT_PROMPT, DEFAULT_UPGRADE_PROMPT, DEFAULT_INTRO_PROMPT, DEFAULT_ENDING_SUB, NEUTRAL_SYSTEM_PROMPT, DEFAULT_INDEPENDENT_PROMPT } from "./defaults";
import { typeset } from "./typeset";
import { fetchNewCommits, repoHeadInfo, saveLastCommit } from "./repogit";
import { festivalContext } from "./festival";

const OUT_DIR = process.env.ARTICLE_OUT_DIR || path.join(process.cwd(), "data", "articles");

export interface GenerateResult {
  ok: boolean;
  title?: string;
  mediaId?: string;
  error?: string;
  sources?: Citation[];
  typesetNote?: string; // 排版降级/重试说明（正常为空）
  kind?: string;        // 实际采用的文类（auto 解析后为 hotspot/upgrade）
  skipped?: boolean;    // 宁缺毋滥：没有可写的题材，本次主动跳过
  note?: string;        // skipped 时的原因说明
}

/** 正在执行生成的账号（含手动与队列），防同账号并发 */
export const runningAccounts = new Set<number>();

/** 签名组件的一句话简介：取身份字段第一段；40 字截断落在括号内时整个括号段去掉，避免半个括号挂着 */
export function signatureIntro(acc: Account): string {
  let s = (acc.identity || acc.name).split(/[。；！？：\n]/)[0].slice(0, 40);
  const open = s.lastIndexOf("（");
  if (open > s.lastIndexOf("）")) s = s.slice(0, open);
  return s.trim() || acc.name;
}

/** 正文小标题列表（## 标题），给自动配图当章节卡文字；最多取 5 个 */
function headingTexts(md: string): string[] {
  const out: string[] = [];
  const re = /^#{1,4}\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) && out.length < 5) {
    const t = m[1].replace(/[#*`]/g, "").trim();
    if (t) out.push(t.slice(0, 28));
  }
  return out;
}

// ---------- 矩阵去重（2026-09-14 加：8 个号在同一池子里捞同一批新闻，同题反复推） ----------

interface RecentTitle {
  title: string;
  account: string;
  when: string;
}

/** 最近 7 天矩阵全部账号已推的【热点文】标题（含本号）——热点文选题禁区。
 *  升级文（主号的产品版本公告）不进禁区：子号写自己赛道的热点跟它不是同一件事，
 *  2026-09-14 实案两子号热点文被误判"撞《3.0.30升级公告》"连环跳过，就是没按文类过滤 */
function recentMatrixTitles(): RecentTitle[] {
  const cutoff = Date.now() - 7 * 86400_000;
  const out: RecentTitle[] = [];
  for (const art of listArticles()) {
    if (art.status !== "pushed" || art.source_type !== "hotspot") continue;
    const ts = new Date(art.created_at.replace(" ", "T")).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const account = getAccount(art.account_id)?.name || String(art.account_id);
    out.push({ title: art.title, account, when: art.created_at.slice(5, 10) });
  }
  return out;
}

function titleBigrams(s: string): Set<string> {
  const t = s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9%]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** 撞题打分：二元组相似度（按短边归一）；含 ≥8 字连续公共片段（同一事件短语）直接记 0.6。
 *  阈值 8 不是 6：全矩阵都在获客赛道，"抖音截流获客"恰好 6 字，共享行业词的标题会连环误杀
 *  （2026-09-14 实案），8 字连续一致才稳算同一事件 */
function titleDupScore(a: string, b: string): number {
  const A = titleBigrams(a);
  const B = titleBigrams(b);
  let jaccard = 0;
  if (A.size && B.size) {
    let inter = 0;
    for (const g of A) if (B.has(g)) inter++;
    jaccard = inter / Math.min(A.size, B.size);
  }
  const x = a.replace(/[^\u4e00-\u9fa5a-zA-Z0-9%]/g, "");
  const y = b.replace(/[^\u4e00-\u9fa5a-zA-Z0-9%]/g, "");
  let lcs = 0;
  const row = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diag = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = row[j];
      row[j] = x[i - 1] === y[j - 1] ? diag + 1 : 0;
      if (row[j] > lcs) lcs = row[j];
      diag = tmp;
    }
  }
  return Math.max(jaccard, lcs >= 8 ? 0.6 : 0);
}

function findMatrixDup(title: string, recent: RecentTitle[]): { title: string; score: number } | null {
  let best: { title: string; score: number } | null = null;
  for (const r of recent) {
    const score = titleDupScore(title, r.title);
    if (score >= 0.5 && (!best || score > best.score)) best = { title: r.title, score };
  }
  return best;
}

export type ArticleKind = "hotspot" | "upgrade" | "intro" | "auto";

export async function generateForAccount(
  accountId: number,
  existingArtId?: number,
  userContent?: string,
  kindReq: ArticleKind = "hotspot"
): Promise<GenerateResult> {
  const acc = getAccount(accountId);
  if (!acc) return { ok: false, error: "账号不存在" };
  // 独立写作模式（promo=0）：账号自带整份提示词，系统不强加万流汇口径——
  // 中性系统提示词、不追加矩阵统一结尾、自动封面不带产品署名、升级文/置顶名片文不可用
  const independent = acc.promo === 0;

  // 必填校验：身份 / 方向 / 受众
  const missing = [
    ["身份", acc.identity],
    ["内容方向", acc.direction],
    ["受众人群", acc.audience],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return { ok: false, error: `账号缺少必填信息：${missing.join("、")}（账号页补齐后再生成）` };
  }

  // Key 跟人不跟号：账号用其 owner 的 Key。admin 的号用 admin 的全局 Key；子用户用自己的个人 Key。
  // 推广期共享（admin 设置页开关）：子用户没配自己的 Key 时，可在每人免费额度内使用 admin 的全局 Key
  let ownerKey =
    acc.owner === "admin"
      ? getSetting(`deepseek_key:admin`) || getSetting("deepseek_key")
      : getSetting(`deepseek_key:${acc.owner}`);
  let shareUsed = -1; // >=0 表示本次走共享额度，仅在生成成功后计 1 次
  if (!ownerKey && acc.owner !== "admin") {
    const shareOn = getSetting("key_share_enabled") === "1";
    const quota = Number(getSetting("key_share_quota")) || 30;
    const used = Number(getSetting(`key_share_used:${acc.owner}`)) || 0;
    if (shareOn && used < quota) {
      ownerKey = getSetting("deepseek_key");
      shareUsed = used;
    } else {
      return {
        ok: false,
        error: shareOn
          ? `免费额度已用完（${quota} 次）——在「设置」页配置自己的 DeepSeek API Key 后继续生成`
          : `账号所属用户「${acc.owner}」还没配置自己的 DeepSeek API Key——该用户登录后在「设置」页填写（管理员的免费额度当前未开放）`,
      };
    }
  }
  if (!ownerKey) {
    return { ok: false, error: "管理员还未配置全局 DeepSeek API Key（设置页）" };
  }

  if (runningAccounts.has(accountId)) {
    return { ok: false, error: "该账号有任务正在执行，请稍后再试" };
  }

  // 文类解析：auto（定时队列用）= 仓库有新提交写升级文，没有写热点文（升级文优先，还原旧"双文型"逻辑）；
  // 手动升级文不粘贴提交时也自动读仓库。独立写作模式的账号与产品仓库无关：auto 永远走热点文，
  // 手动点升级文/名片文直接拒绝
  let kind = kindReq === "auto" ? "hotspot" : kindReq;
  if (independent && (kind === "upgrade" || kind === "intro")) {
    return {
      ok: false,
      error: `「${acc.name}」是独立写作模式（未跟随万流汇推广体系），不支持升级文/置顶名片文，请用热点文`,
    };
  }
  let commitText = userContent?.trim() || "";
  let latestCommit = "";
  if (!independent && (kindReq === "auto" || (kindReq === "upgrade" && !commitText))) {
    try {
      const c = await fetchNewCommits();
      if (c.count > 0) {
        kind = "upgrade";
        commitText = c.text;
        latestCommit = c.latest;
      } else if (kindReq === "upgrade") {
        const head = await repoHeadInfo();
        return { ok: false, error: `仓库没有上次写文之后的新提交（已写到：${head}）。先在开发机 git push，或在面板直接粘贴提交记录` };
      }
    } catch (e) {
      // 定时任务兜底：读不到仓库就退回热点文，绝不因此空跑一天
      if (kindReq === "auto") {
        console.warn("[pipeline] 读产品仓库失败，本次走热点文:", e instanceof Error ? e.message : e);
      } else {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  const artId = existingArtId ?? addArticle(accountId, "生成中…", "generating", kind);
  runningAccounts.add(accountId);

  try {
    // Redfox 真实数据弹药（仅热点文且用户没指定素材时拉取）：抖音涨粉榜 + 小红书低粉爆文 +
    // 公众号爆文搜索三路并行。没配 key / 数据源失败都返回空串，静默降级回纯联网检索
    const redfoxBlock =
      kind === "hotspot" && !userContent?.trim() ? await redfoxTopicAmmo() : "";
    if (redfoxBlock) console.log(`[pipeline] 账号${accountId} Redfox 选题弹药已注入（${redfoxBlock.length} 字符）`);

    // 1. 组装提示词：热点文=面板可编辑模板+联网搜热点；升级文=升级模板+git 提交记录（不联网）。
    //    账号「跟随系统」关闭时优先用本账号自定义模板（非空才生效，留空的文类仍回退系统版）。
    //    独立写作模式（promo=0）：账号的 hotspot_prompt 就是整篇提示词（非空即生效，不看 follow_system），
    //    留空则用独立模式兜底模板（只用账号人设三件套，不带万流汇营销结构）
    const useCustom = acc.follow_system === 0;
    const promptTemplate =
      kind === "upgrade"
        ? (useCustom && acc.upgrade_prompt?.trim()) || getPromptByType("upgrade")?.content || DEFAULT_UPGRADE_PROMPT
        : kind === "intro"
          ? getPromptByType("intro")?.content || DEFAULT_INTRO_PROMPT
          : independent
            ? acc.hotspot_prompt?.trim() || DEFAULT_INDEPENDENT_PROMPT
            : (useCustom && acc.hotspot_prompt?.trim()) || getPromptByType("hotspot")?.content || DEFAULT_HOTSPOT_PROMPT;
    const ideasBlock = acc.ideas?.trim()
      ? `【号主的想法（可融入文章，不必全部使用，保持口径一致）】\n${acc.ideas.trim()}\n`
      : "";
    const today = new Date();
    const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    const prompt = promptTemplate
      .replaceAll("{ACCOUNT_NAME}", acc.name)
      .replaceAll("{IDENTITY}", acc.identity)
      .replaceAll("{DIRECTION}", acc.direction)
      .replaceAll("{AUDIENCE}", acc.audience)
      .replaceAll("{IDEAS}", ideasBlock)
      .replaceAll("{REDFOX_DATA}", redfoxBlock || "（本期无实时榜单数据，直接按第一步联网检索选题）")
      .replaceAll("{FESTIVAL}", festivalContext(today))
      .replaceAll("{TODAY}", todayStr);
    // 面板存过的旧热点模板没有 {REDFOX_DATA} 占位符——为不依赖人工去面板改模板，此时把弹药
    // 自动追加到提示词末尾；新模板有占位符的按占位符位置注入，不重复追加
    const foxAppend =
      redfoxBlock && !promptTemplate.includes("{REDFOX_DATA}")
        ? `\n\n【真实数据弹药（Redfox 数据平台采集的真实公开数据，优先从这里取材选题）】\n${redfoxBlock}`
        : "";

    // 用户本次指定的素材：优先级高于联网选题——模板默认让模型自己搜热点，
    // 用户给了素材就该围绕素材写，两周时效红线不再拦截用户主动给出的内容
    const finalPrompt = userContent?.trim()
      ? `${prompt}\n\n【本期用户指定素材（最高优先级）】\n用户为这一期提供了以下素材/想法，直接以它为本期主题成文，跳过第一步的联网选题（检索仅可作背景补充），时效红线不适用于用户主动给出的素材：\n${userContent.trim()}\n`
      : prompt;

    // 素材注入：热点文=用户素材（最高优先级，跳过联网选题）；升级文=git 提交记录（唯一素材）
    const materialBlock = commitText
      ? kind === "upgrade"
        ? `\n\n【本期 git 提交记录（唯一素材，直接据此成文）】\n${commitText}\n`
        : `\n\n【本期用户指定素材（最高优先级）】\n用户为这一期提供了以下素材/想法，直接以它为本期主题成文，跳过第一步的联网选题（检索仅可作背景补充），时效红线不适用于用户主动给出的素材：\n${commitText}\n`
      : "";

    // 矩阵去重：仅热点文（且用户没指定素材时）注入近 7 天全矩阵已推标题当禁区；
    // 升级文素材=同一份 git 提交、名片文是常驻产品介绍，去重对两者无意义
    const recentTitles =
      kind !== "hotspot" || userContent?.trim() ? [] : recentMatrixTitles();
    const dupBlock = recentTitles.length
      ? `\n\n【矩阵去重红线（最高优先级）】最近 7 天，矩阵里任何账号（包括本号）已经推送过以下标题。本期严禁再写同一事件或同一角度——换措辞、换小标题、换个说法都算重复；必须另选列表之外的题材，宁可写讨论度低一点的新变化。若检索到的候选全在列表里，就选列表外次热的新题材：\n${recentTitles
          .map((r) => `- ${r.when}《${r.title}》（${r.account}）`)
          .join("\n")}`
      : "";

    // 2. 写作：热点文走联网通道（Anthropic 端点 web_search）；升级文不需要检索，关闭联网。
    //    幂等重试 3 次：调用异常（网络掐断/接口报错）、"输出无标题行"（拒稿/泄漏内部语法）、
    //    撞题（标题与矩阵近 7 天已推相似）都重试，撞题时带上指名道姓的换题材指令；
    //    宁缺毋滥（2026-09-14）：模型按提示词判死"今天没东西可写"输出 SKIP，或撞题 3 次躲不开，
    //    都记 skipped 不推稿——重复是订阅杀手，空一天比推重复稿强
    let content = "";
    let citations: Citation[] = [];
    let searchCalls = 0;
    let lastErr: unknown = null;
    let dupHit = "";
    let dupCount = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      // 重试分级：第一次撞题 → 换个新闻题材再试（可能只是挑中了已写的事件）；
      // 第二次再撞 → 新闻池大概率当天已空，禁止再写任何事件类题材，强制切常青选题库路线
      // （行业新闻两周就 3-4 件事，不分级的"换题材重试"会 3 次都翻同一批新闻连环撞，2026-09-15 实案）
      const retryNote = !dupHit
        ? ""
        : dupCount === 1
          ? `\n\n【必须换题材整篇重写】你上一稿与矩阵已推的《${dupHit}》写的是同一件事（撞题，后台已拦截）。放弃那个事件，另选【矩阵去重红线】列表之外的题材，从头重写整篇；若确实没有任何可写的题材，按【宁缺毋滥】输出 SKIP。`
          : `\n\n【最后一次机会：放弃新闻事件路线】你已连续两次撞题（最近《${dupHit}》），说明今天的热点事件基本都被矩阵写过了。这一稿禁止再写任何新闻、新规、行业动态类题材——直接从【常青选题库】挑一个矩阵没写过的角度（低粉爆文拆解、涨粉榜观察这类不依赖新闻的角度优先），写一篇常青演变/方法论文章；若常青角度也全部被写过，按【宁缺毋滥】输出 SKIP。`;
      try {
        const r = await deepseekChat(
          finalPrompt + foxAppend + dupBlock + materialBlock + retryNote,
          ownerKey,
          // 独立写作模式：系统提示词换成中性版（不带万流汇产品叙事与获客标题红线）
          kind === "hotspot"
            ? independent
              ? { instructions: NEUTRAL_SYSTEM_PROMPT }
              : {}
            : { webSearch: false, temperature: 0.6 }
        );
        content = r.content;
        citations = r.citations;
        searchCalls = r.searchCalls;
      } catch (e) {
        lastErr = e;
        content = "";
      }
      // 宁缺毋滥出口：模型判定无可写题材，整篇只回 SKIP: 原因
      const skipMatch = content ? content.match(/^\s*SKIP\s*[:：]\s*(.{1,100})/m) : null;
      if (skipMatch) {
        const reason = skipMatch[1].trim();
        updateArticle(artId, { status: "skipped", title: `未写：${reason.slice(0, 30)}`, error: reason });
        console.warn(`[pipeline] 账号${accountId} 宁缺毋滥跳过：${reason}`);
        return { ok: true, skipped: true, note: reason, kind };
      }
      const parsed = content ? splitTitleAndBody(content) : null;
      if (!parsed?.title) {
        const why = lastErr
          ? `调用失败：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
          : `输出无标题行（开头：${content.slice(0, 60).replace(/\n/g, " ")}）`;
        console.warn(`[pipeline] 账号${accountId} 第${attempt}/3 次${why}，${attempt < 3 ? "重试" : "放弃"}`);
        if (attempt < 3) await new Promise((s) => setTimeout(s, 2000));
        continue;
      }
      const dup = recentTitles.length ? findMatrixDup(parsed.title, recentTitles) : null;
      if (!dup) break;
      console.warn(
        `[pipeline] 账号${accountId} 第${attempt}/3 次撞题《${parsed.title.slice(0, 24)}》≈《${dup.title.slice(
          0,
          24
        )}》(相似度 ${Math.round(dup.score * 100)}%)，${attempt < 3 ? "换题材重试" : "按宁缺毋滥跳过"}`
      );
      dupHit = dup.title;
      dupCount++;
      content = "";
      lastErr = null;
      if (attempt < 3) await new Promise((s) => setTimeout(s, 2000));
    }
    if (!content) {
      if (dupHit) {
        const reason = `去重重试 3 次仍与近期文章撞题（最接近《${dupHit}》），按宁缺毋滥跳过本次`;
        updateArticle(artId, { status: "skipped", title: "未写：连续撞题", error: reason });
        console.warn(`[pipeline] 账号${accountId} ${reason}`);
        return { ok: true, skipped: true, note: reason, kind };
      }
      throw new Error(
        `DeepSeek 连续 3 次调用失败：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
      );
    }
    const { title, body } = splitTitleAndBody(content);
    if (!title) {
      throw new Error(
        `模型 3 次输出均无标题行（TITLE: ...），最后一次开头：${content.slice(0, 60).replace(/\n/g, " ")}`
      );
    }
    // 联网健康检查：热点文声明联网但服务端一次 web_search 都没执行（模型不支持/功能变动）时，
    // 选题就不是真实检索来的——不拦推送，但在面板提示，避免"旧闻当热点"无人知晓
    let searchNote = "";
    if (kind === "hotspot" && searchCalls === 0) {
      searchNote = "注意：本次联网检索未实际执行（当前联网模型不支持 web_search），选题并非来自真实搜索";
      console.warn(`[pipeline] 账号${accountId} ${searchNote}`);
    }
    const cleaned = splitSources(body);
    const sources = cleaned.sources.length ? cleaned.sources : citations;

    // 发文前违禁词检查（Redfox 三平台词库）：检出只记提示不阻塞——夜间全自动队列没法人工改稿，
    // 但提示会带进面板的排版备注，人工预览/转发前有据可查。检查失败静默跳过
    let bannedNote = "";
    try {
      const bannedWords = await redfoxBannedWords(`${title}\n${cleaned.body}`);
      if (bannedWords.length) {
        bannedNote = `违禁词提示：检出「${bannedWords.slice(0, 8).join("、")}」${bannedWords.length > 8 ? `等 ${bannedWords.length} 处` : ""}，建议替换后再群发`;
        console.warn(`[pipeline] 账号${accountId} ${bannedNote}`);
      }
    } catch {
      /* 词库服务不可用时跳过检查 */
    }

    // 3. 固定结尾：账号单独设置 > 所属用户的自定义结尾（设置页）> 系统默认（通用关注+私信版）。
    //    独立写作模式只认账号自己写的结尾——不设置就什么都不追加（系统结尾是万流汇口径，不能硬塞）
    const ending = independent
      ? acc.ending || ""
      : acc.ending ||
        getSetting(`ending:${acc.owner}`) ||
        getSetting("ending_default") ||
        DEFAULT_ENDING_SUB;
    const alreadyEnded = /看到就回|关注我，别掉队/.test(cleaned.body);
    const md = alreadyEnded || !ending ? `${cleaned.body}\n` : `${cleaned.body}\n\n---\n\n${ending}\n`;

    // 4. 落盘
    const date = new Date();
    const fname = `2026-${date.getMonth() + 1}-${date.getDate()}-${title.slice(0, 30).replace(/[\\/:*?"<>|]/g, "")}.md`;
    const mdPath = path.join(OUT_DIR, String(acc.id), fname);
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, md, "utf-8");

    // 5. 封面取图：固定封面 > 本号素材库封面类随机一张 > 自动生成深色标题封面。
    //    自动封面优先 SVG 自绘（设计感强），resvg/字体不可用时回退旧 canvas，夜间队列绝不因此空推
    const coverPool = listMaterials(accountId, "cover");
    const poolCover =
      acc.custom_cover_media_id || !coverPool.length
        ? null
        : coverPool[Math.floor(Math.random() * coverPool.length)];
    let png: Buffer | null = null;
    if (!acc.custom_cover_media_id && !poolCover) {
      const coverTitle = title.slice(0, 14);
      const coverSub = independent ? acc.name : "万流汇获客 · 截流获客打法";
      const coverSign = independent ? acc.name : "daydayago";
      try {
        png = svgToPng(coverSvg(coverTitle, coverSub, coverSign));
      } catch (e) {
        console.warn("[pipeline] SVG 封面渲染失败，回退 canvas 封面:", e instanceof Error ? e.message : e);
        png = generateCover(coverTitle, coverSub, coverSign);
      }
    }

    // 6. 排版：优先 gzh-design skill 排版引擎（主题可在设置页换），失败回退内置简易转换。
    //    署名/简介传给签名组件（不传就会留 {{作者名}} 占位符原样进草稿）
    let html = "";
    let htmlPath = "";
    let typesetNote = "";
    const themeId = getSetting("typeset_theme") || "moyu-green";
    try {
      const r = await typeset(md, {
        title,
        themeId,
        key: ownerKey,
        author: acc.name,
        intro: signatureIntro(acc),
      });
      html = r.html;
      if (r.retried) typesetNote = `排版校验首轮未过，重试后通过（主题 ${r.theme.name}）`;
      // 排版产物落盘在 md 旁边，供预览 / 人工核对 / 手动粘贴兜底
      htmlPath = mdPath.replace(/\.md$/, `_排版_${r.theme.name}(${r.theme.id}).html`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      html = mdToWechatHtml(md);
      typesetNote = `skill 排版失败，已回退内置简易排版（${msg}）`;
      console.warn(`[pipeline] 账号${accountId} ${typesetNote}`);
      // 回退产物同样落盘，保证预览始终有东西可看
      htmlPath = mdPath.replace(/\.md$/, "_简易排版.html");
    }

    // 6.5 正文自动配图：整篇没有图片时，画一张留白禅意风水墨题图（900×400，印章刻账号名）
    //     插到正文第一个小标题所在的 section 前——即开篇位置，素材库没图的新号也能篇篇带图。
    //     锚不到标题/上传失败都静默跳过，绝不硬塞
    let illustrationNote = "";
    if (html && !/<img[\s>]/i.test(html)) {
      try {
        const headings = headingTexts(md);
        if (headings.length) {
          const imgToken = await getAccessToken(acc);
          const url = await uploadContentImage(
            acc,
            imgToken,
            svgToPng(inkOpeningSvg(acc.id, acc.name)),
            "ink-opening.png"
          );
          const imgHtml = `\n<p style="text-align:center;margin:20px 0 24px;"><img src="${url}" style="max-width:100%;border-radius:10px;"/></p>\n`;
          // 锚点优先级：①h 标签（简易排版产物）②标题文字前缀（gzh-design 产物无 h 标签，标题排进
          // section/span——个别标题文字会被引擎拆开，用 8/6/4/3 字前缀逐级试），插到所在 <section> 前
          let at = -1;
          const hm = /<h[1-4][\s>]/i.exec(html);
          if (hm) at = hm.index;
          else {
            for (const h of headings) {
              for (const n of [8, 6, 4, 3]) {
                if (h.length < n) continue;
                const i2 = html.indexOf(h.slice(0, n));
                if (i2 > 0) {
                  const s2 = html.lastIndexOf("<section", i2);
                  if (s2 > 0) at = s2;
                  break;
                }
              }
              if (at >= 0) break;
            }
          }
          if (at > 0) {
            html = html.slice(0, at) + imgHtml + html.slice(at);
            illustrationNote = "已自动配水墨题图";
          }
        }
      } catch (e) {
        console.warn("[pipeline] 自动配图失败，正文保持纯文字:", e instanceof Error ? e.message : e);
      }
    }
    if (htmlPath && html) fs.writeFileSync(htmlPath, html, "utf-8");

    // 7. 推微信草稿箱（微信 media_id 按公众号隔离：自有封面直接引用；共享封面首次用先转存为本号素材并缓存）
    const token = await getAccessToken(acc);
    let thumbId = acc.custom_cover_media_id || "";
    if (!thumbId && poolCover) {
      thumbId = poolCover.ref || poolCover.refs?.[String(accountId)] || "";
      if (!thumbId) {
        thumbId = await uploadCover(acc, token, readMaterial(poolCover), poolCover.name);
        cacheMaterialRef(poolCover.id, accountId, thumbId);
      }
    }
    if (!thumbId) thumbId = await uploadCover(acc, token, png as Buffer);
    const mediaId = await addDraft(acc, token, {
      title,
      content: html,
      thumbMediaId: thumbId,
      digest: title,
      author: acc.name.slice(0, 8),
    });

    updateArticle(artId, {
      title,
      md_path: mdPath,
      html_path: htmlPath,
      media_id: mediaId,
      status: "pushed",
      sources_json: JSON.stringify(sources),
    });
    // 记录 7 天滚动清理，累计成功篇数单独计数
    bumpArticlesTotal();
    // 共享额度：成功生成才计 1 次（写作+排版同属一篇文章，不重复计）
    if (shareUsed >= 0) {
      setSetting(`key_share_used:${acc.owner}`, String(shareUsed + 1));
    }
    // 升级文成功推送后推进仓库游标，下次从这里往后取新提交
    if (kind === "upgrade" && latestCommit) saveLastCommit(latestCommit);
    return {
      ok: true,
      title,
      mediaId,
      sources,
      typesetNote: [typesetNote, searchNote, bannedNote, illustrationNote].filter(Boolean).join("；"),
      kind,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    updateArticle(artId, { status: "failed", error: msg });
    return { ok: false, error: msg };
  } finally {
    runningAccounts.delete(accountId);
  }
}

/** md→微信 HTML：skill 排版引擎失败时的兜底转换（蓝紫渐变简易样式） */
export function mdToWechatHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s).replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#1a1a1a;">$1</strong>');
  const P = 'margin:18px 0;text-align:justify;word-break:break-word;';
  const H2 =
    "font-size:24px;font-weight:600;color:#1a1a1a;margin:28px 0 20px 0;padding-bottom:12px;" +
    "border-bottom:2px solid transparent;" +
    "background-image:linear-gradient(90deg,#7c3aed 0%,#3b82f6 50%,transparent 50%);" +
    "background-size:100% 2px;background-position:0 100%;background-repeat:no-repeat;line-height:1.4;";
  const blocks = md.split(/\n{2,}/);
  const out: string[] = [];
  for (const b of blocks) {
    const t = b.trim();
    if (!t) continue;
    if (t === "---") {
      out.push(
        '<hr style="border:none;height:2px;background:linear-gradient(90deg,transparent 0%,#7c3aed 50%,transparent 100%);margin:32px 0;"/>'
      );
    } else if (t.startsWith("## ")) {
      out.push(`<h2 style="${H2}">${inline(t.slice(3))}</h2>`);
    } else if (t.startsWith("### ")) {
      out.push(`<h3 style="font-size:19px;font-weight:600;color:#1a1a1a;margin:24px 0 12px 0;line-height:1.4;">${inline(t.slice(4))}</h3>`);
    } else if (t.startsWith("> ")) {
      const q = t.split("\n").map((l) => l.replace(/^>\s?/, "")).join("<br/>");
      out.push(
        `<blockquote style="margin:20px 0;padding:14px 18px;background:#f8f5ff;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;color:#666;">${inline(q)}</blockquote>`
      );
    } else if (/^[-*]\s/.test(t)) {
      const items = t
        .split("\n")
        .map((l) => l.replace(/^[-*]\s+/, "").trim())
        .filter(Boolean)
        .map(
          (l) =>
            `<li style="margin:8px 0;line-height:1.8;list-style:none;padding-left:16px;"><span style="color:#7c3aed;font-weight:600;margin-right:6px;">▪</span>${inline(l)}</li>`
        )
        .join("");
      out.push(`<ul style="margin:16px 0;padding-left:12px;">${items}</ul>`);
    } else {
      out.push(`<p style="${P}">${inline(t.replace(/\n/g, "<br/>"))}</p>`);
    }
  }
  return out.join("\n");
}
