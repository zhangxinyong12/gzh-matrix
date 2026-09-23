// 产品仓库提交读取：面板直接读 siyu 本地裸仓库（本地开发机 push 时双推 GitHub + siyu）
// 这样面板无需 GitHub 凭据、不受国内访问 GitHub 网络波动影响
import { execFile } from "child_process";
import { promisify } from "util";
import { getSetting, setSetting } from "./store";

const run = promisify(execFile);

const GIT_DIR = process.env.GIT_REPO_DIR || "/opt/git/articles.git";
// 只统计用户可感知的路径：按你自己的仓库路径用 GIT_LOG_PATHS 配置（demo 默认值无业务含义）
const LOG_PATHS = (process.env.GIT_LOG_PATHS || "ui-v3 xhs-v1 ks-v1")
  .split(/\s+/).filter(Boolean);

// 上次已写成升级文的提交（全局：产品仓库只有一个，由主号消费）
export const LAST_COMMIT_KEY = "upgrade_last_commit";

export interface NewCommits {
  count: number;
  latest: string;   // 最新提交短 hash
  text: string;     // 喂给模型的提交清单（含每条改动路径，供模型判断涉及的产品版本）
}

interface CommitBlock {
  hash: string;
  date: string;
  subject: string;
  files: string[];
}

async function gitLog(range: string[]): Promise<string> {
  const args = [
    "--git-dir", GIT_DIR, "log", ...range,
    "--format=%h %ad %s", "--date=short", "-60",
    "--", ...LOG_PATHS,
  ];
  const r = await run("git", args, { maxBuffer: 10 * 1024 * 1024 });
  return r.stdout.trim();
}

/** 带每条提交改动文件的日志（--name-only，用 --hash| 分隔行解析） */
async function gitLogWithFiles(range: string[]): Promise<CommitBlock[]> {
  const args = [
    "--git-dir", GIT_DIR, "log", ...range,
    "--format=--%h|%ad|%s", "--date=short", "-60", "--name-only",
    "--", ...LOG_PATHS,
  ];
  const r = await run("git", args, { maxBuffer: 10 * 1024 * 1024 });
  const blocks: CommitBlock[] = [];
  for (const line of r.stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("--")) {
      const [hash, date, ...rest] = t.slice(2).split("|");
      blocks.push({ hash, date, subject: rest.join("|"), files: [] });
    } else if (blocks.length) {
      blocks[blocks.length - 1].files.push(t);
    }
  }
  return blocks;
}

/** 仓库当前最新提交（用于提示"已经写到哪了"） */
export async function repoHeadInfo(): Promise<string> {
  const out = await gitLog(["-1"]);
  return out || "（空仓库）";
}

/**
 * 读上次写文之后的新提交。首次使用（无标记）回看 7 天。
 * 标记因 rebase/force-push 失效时同样回退时间窗。
 * 每条提交附改动文件路径（截断），模型据此判断更新属于哪个产品版本（3.0 抖音版 / 4.0 独立版 / 小红书版 / 快手版）。
 */
export async function fetchNewCommits(): Promise<NewCommits> {
  const marker = getSetting(LAST_COMMIT_KEY);
  const range = marker ? [`${marker}..HEAD`] : ["--since=7 days ago"];
  let blocks: CommitBlock[];
  try {
    blocks = await gitLogWithFiles(range);
  } catch {
    if (marker) blocks = await gitLogWithFiles(["--since=7 days ago"]);
    else throw new Error(`读取产品仓库失败（${GIT_DIR} 不存在或不可读）`);
  }
  const text = blocks
    .map((b) => {
      const files = [...new Set(b.files)].slice(0, 8);
      const more = b.files.length > files.length ? ` 等 ${b.files.length} 个文件` : "";
      return files.length
        ? `- ${b.hash} ${b.date} ${b.subject}\n  改动: ${files.join("、")}${more}`
        : `- ${b.hash} ${b.date} ${b.subject}`;
    })
    .join("\n");
  return {
    count: blocks.length,
    latest: blocks[0]?.hash || marker || "",
    text,
  };
}

export function saveLastCommit(hash: string): void {
  if (hash) setSetting(LAST_COMMIT_KEY, hash);
}
