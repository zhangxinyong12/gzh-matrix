// 营销节点表：{FESTIVAL} 变量的数据源。节日 = 私域获客高发期（用户 2026-09-15 定调：
// 中秋国庆是私域高发窗口），节点自动进提示词，让内容踩准备战/实战/承接节奏，不用人工记日子。
// 覆盖到 2027 年中；过期节点保留无害（|diff|>30 天不输出），明年补明年即可
const NODES: { name: string; date: string; note: string }[] = [
  { name: "中秋", date: "2026-09-25", note: "礼盒、本地吃喝玩乐商家节日获客高发" },
  { name: "国庆黄金周", date: "2026-10-01", note: "与中秋双节连发，全年私域高发窗口之一" },
  { name: "双11", date: "2026-11-11", note: "全年最大获客变现窗口，10 月下旬即进入备战" },
  { name: "双12", date: "2026-12-12", note: "年末冲刺，清库存拉新" },
  { name: "年货节", date: "2027-01-15", note: "春节前私域成交旺季" },
  { name: "春节", date: "2027-02-06", note: "假期流量高位 + 节后开工获客的前哨" },
  { name: "开工季", date: "2027-02-22", note: "节后商家获客需求爆发期" },
  { name: "38女神节", date: "2027-03-08", note: "女性消费品类高发" },
  { name: "618", date: "2027-06-18", note: "年中大促，5 月下旬进入备战" },
];

/** 当前营销节点上下文：未来 30 天内临近的节点（备战视角）+ 刚过 7 天内的节点（承接视角）。
 *  无节点返回空串，提示词里表现为"当前无重大营销节点，按常规节奏"。 */
export function festivalContext(today = new Date()): string {
  const day = 86400_000;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const parts: string[] = [];
  for (const n of NODES) {
    const [y, m, d] = n.date.split("-").map(Number);
    const diff = Math.round((new Date(y, m - 1, d).getTime() - startOfToday) / day);
    const md = `${m}月${d}日`;
    if (diff > 0 && diff <= 30) {
      const phase = diff <= 3 ? "最后窗口" : diff <= 10 ? "备战正当时" : "可以开始布局";
      parts.push(`${n.name}（${md}）还有 ${diff} 天——${n.note}，${phase}`);
    } else if (diff <= 0 && diff >= -7) {
      parts.push(`${n.name}（${md}）${diff === 0 ? "就是今天" : `刚过 ${-diff} 天`}——${n.note}，正处实战/承接期`);
    }
  }
  return parts.length ? parts.join("；") : "当前无重大营销节点，按常规节奏写";
}
