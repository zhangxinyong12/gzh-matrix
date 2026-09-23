// 全局错峰队列：到点任务排队，按固定间隔逐个执行，避免多号集中调用接口被限流
import { generateForAccount, runningAccounts } from "./pipeline";
import { addArticle, updateArticle, listArticles } from "./store";

const GAP_MS = Number(process.env.QUEUE_GAP_MS) || 120_000; // 队列任务间隔，默认 2 分钟

interface Task {
  accountId: number;
  artId: number;
}

const queue: Task[] = [];
const todayQueued = new Set<string>(); // "accountId|本地日期" 防同日重复入队
let working = false;

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 每日定时入队：同日同号只入一次；当天已成功推送过的号直接跳过。
 * 返回 false 表示未入队（重复/已完成/正在跑）。
 */
export function enqueueDaily(accountId: number): boolean {
  const key = `${accountId}|${localToday()}`;
  if (todayQueued.has(key) || runningAccounts.has(accountId)) return false;
  const pushed = listArticles().some(
    (a) => a.account_id === accountId && a.status === "pushed" && a.created_at.startsWith(localToday())
  );
  if (pushed) return false;

  todayQueued.add(key);
  const artId = addArticle(accountId, "排队中，稍后自动生成…", "queued");
  queue.push({ accountId, artId });
  console.log(`[queue] 入队 账号${accountId}，当前队列长度 ${queue.length}`);
  void drain();
  return true;
}

async function drain(): Promise<void> {
  if (working) return;
  working = true;
  while (queue.length > 0) {
    const task = queue.shift()!;
    updateArticle(task.artId, { status: "generating", title: "生成中…" });
    try {
      // auto：仓库有新提交→升级文，没有→热点文（升级文优先）；skipped=宁缺毋滥没题材，不写
      const r = await generateForAccount(task.accountId, task.artId, undefined, "auto");
      console.log(
        `[queue] 账号${task.accountId} ${
          r.skipped ? `跳过未写: ${r.note}` : r.ok ? `完成: ${r.title}` : `失败: ${r.error}`
        }`
      );
    } catch (e) {
      console.error(`[queue] 账号${task.accountId} 异常:`, e);
      updateArticle(task.artId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
    // 错峰间隔：还有后续任务才等待
    if (queue.length > 0) await sleep(GAP_MS);
  }
  working = false;
}
