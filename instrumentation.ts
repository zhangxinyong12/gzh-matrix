// Next.js 启动时挂载 node-cron：每天按各账号 gen_time 触发（全局队列自动错峰）
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const cron = await import("node-cron");
  const { listAccounts, pruneArticles } = await import("./lib/store");
  const { enqueueDaily } = await import("./lib/queue");

  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const accounts = listAccounts().filter((a) => a.enabled && a.gen_time === hhmm);
      for (const acc of accounts) {
        const ok = enqueueDaily(acc.id);
        if (ok) console.log(`[cron] 账号 ${acc.name}(${acc.id}) 已入队`);
      }
    } catch (e) {
      console.error("[cron] 调度异常:", e);
    }
  });

  // 生成记录只留 7 天（文章已推草稿箱）：每天 04:30 清理，启动时也清一次
  cron.schedule("30 4 * * *", () => {
    try {
      const n = pruneArticles();
      if (n) console.log(`[cron] 已清理 ${n} 条超 7 天的生成记录（含本地 md/html）`);
    } catch (e) {
      console.error("[cron] 记录清理异常:", e);
    }
  });
  const pruned = pruneArticles();
  if (pruned) console.log(`[cron] 启动清理：移除 ${pruned} 条超期生成记录`);

  console.log("[cron] 矩阵写文调度已启动（到点入队，自动错峰执行）");
}
