"use client";
import { useEffect, useRef, useState } from "react";
import { Card, Table, Button, Tag, App, Tooltip, Input, Modal, Segmented, Select, Dropdown } from "antd";
import {
  TeamOutlined,
  FileTextOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  ThunderboltFilled,
  ClockCircleOutlined,
  RightOutlined,
  EyeOutlined,
  CopyOutlined,
  PictureOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import type { ColumnsType } from "antd/es/table";
import { copyRichToClipboard } from "@/lib/clipboard";

interface Article {
  id: number;
  account_id: number;
  account_name: string;
  owner?: string;
  title: string;
  status: string;
  source_type: string;
  media_id: string | null;
  error: string | null;
  created_at: string;
}
interface Account {
  id: number;
  name: string;
  role: string;
  enabled: number;
  gen_time: string;
  owner?: string;
}
interface PreviewData {
  title?: string;
  kind?: "html" | "md";
  html?: string;
  note?: string;
  error?: string;
}
interface LibMat {
  id: number;
  account_id: number; // 所属账号（素材与账号 1-1 绑定）
  name: string;
  ref: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  pushed: { label: "已推送", color: "success" },
  failed: { label: "失败", color: "error" },
  generating: { label: "生成中", color: "processing" },
  queued: { label: "排队中", color: "warning" },
  skipped: { label: "跳过未写", color: "default" },
};

const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function StatCard({
  icon,
  tile,
  value,
  label,
  sub,
}: {
  icon: React.ReactNode;
  tile: string;
  value: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="gzh-card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-[19px] shrink-0 ${tile}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[26px] font-bold leading-tight text-[#111827] tabular-nums">{value}</div>
        <div className="text-[13px] text-black/45 mt-0.5 whitespace-nowrap">
          {label} <span className="text-black/30">· {sub}</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { message } = App.useApp();
  const [articles, setArticles] = useState<Article[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [genContent, setGenContent] = useState("");
  const [genType, setGenType] = useState<"auto" | "hotspot" | "upgrade" | "intro">("auto");
  const [me, setMe] = useState<{ role?: string; total_generated?: number } | null>(null);
  const [fAccount, setFAccount] = useState<number | undefined>();
  const [fOwner, setFOwner] = useState<string | undefined>();
  const [fStatus, setFStatus] = useState<string | undefined>();
  const [preview, setPreview] = useState<{
    open: boolean;
    loading: boolean;
    title: string;
    id?: number;
    accountId?: number;
    data: PreviewData | null;
  }>({
    open: false,
    loading: false,
    title: "",
    id: undefined,
    accountId: undefined,
    data: null,
  });
  const [mediaBusy, setMediaBusy] = useState(false);
  const [libMats, setLibMats] = useState<LibMat[]>([]);
  const [libFor, setLibFor] = useState<number | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setArticles(await (await fetch("/api/articles")).json());
    setAccounts(await (await fetch("/api/accounts")).json());
  };
  useEffect(() => {
    load();
    fetch("/api/me").then((r) => r.json()).then(setMe);
  }, []);

  const gen = async (id: number, name: string) => {
    setBusy(id);
    const r = await (
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: id, content: genContent.trim() || undefined, type: genType }),
      })
    ).json();
    setBusy(null);
    if (r.ok) {
      message.success(`生成成功：《${r.title}》`);
      if (r.typesetNote) message.info(r.typesetNote, 6);
      setGenContent("");
    } else message.error(`失败：${r.error}`);
    load();
  };

  const openPreview = async (a: Article) => {
    setPreview({ open: true, loading: true, title: a.title, id: a.id, accountId: a.account_id, data: null });
    const r: PreviewData = await (await fetch(`/api/articles/preview?id=${a.id}`)).json();
    setPreview((p) => ({ ...p, loading: false, data: r }));
  };

  // 内容变更后重拉预览，让插图立刻可见
  const refreshPreview = async () => {
    if (!preview.id) return;
    setPreview((p) => ({ ...p, loading: true }));
    const rr: PreviewData = await (await fetch(`/api/articles/preview?id=${preview.id}`)).json();
    setPreview((p) => ({ ...p, loading: false, data: rr }));
  };

  // 预览页图片增强：换封面 / 插入正文图片（直接更新已推送的草稿）
  const uploadMedia = async (mode: "cover" | "content", files: File[]) => {
    if (!preview.id) return;
    setMediaBusy(true);
    const fd = new FormData();
    fd.append("id", String(preview.id));
    fd.append("mode", mode);
    files.forEach((f) => fd.append(mode === "cover" ? "file" : "files", f));
    try {
      const r = await (await fetch("/api/articles/images", { method: "POST", body: fd })).json();
      if (r.ok) {
        message.success(r.msg || "已更新草稿");
        if (mode === "content") await refreshPreview();
      } else message.error(r.error || "操作失败");
    } catch {
      message.error("上传失败，请重试");
    } finally {
      setMediaBusy(false);
    }
  };

  // 素材库直插：按素材 id 取用本号素材（无直链的旧素材首次使用会自动转存），不再重复上传
  const insertFromLib = async (materialId: number) => {
    if (!preview.id) return;
    setMediaBusy(true);
    const fd = new FormData();
    fd.append("id", String(preview.id));
    fd.append("mode", "content");
    fd.append("material_ids", JSON.stringify([materialId]));
    try {
      const r = await (await fetch("/api/articles/images", { method: "POST", body: fd })).json();
      if (r.ok) {
        message.success(r.msg || "已插入素材库图片");
        await refreshPreview();
      } else message.error(r.error || "插入失败");
    } finally {
      setMediaBusy(false);
    }
  };

  const loadLib = async (accountId: number) => {
    const r = await (await fetch(`/api/materials?account_id=${accountId}&type=content`)).json();
    setLibMats(r.materials || []);
    setLibFor(accountId);
  };

  const libMenu = {
    items: libMats.length
      ? libMats.map((m) => ({
          key: String(m.id),
          label: (
            <span className="max-w-[260px] inline-block truncate">
              {m.name}
              
            </span>
          ),
        }))
      : [{ key: "empty", disabled: true, label: "该账号还没有正文配图（账号管理 → 素材库里上传）" }],
    onClick: ({ key }: { key: string }) => insertFromLib(Number(key)),
  };

  // 富文本复制统一走 lib/clipboard（HTTP 无安全上下文，navigator.clipboard 不可用）；
  // 浏览器把选区以 text/html+text/plain 双格式写入剪贴板，公众号后台正文区直接 Ctrl+V 保留排版
  const copyRich = copyRichToClipboard;

  const copyPreview = async () => {
    const html = preview.data?.html;
    if (!html) return;
    const ok = await copyRich(html);
    if (ok) message.success("已复制富文本，到公众号后台正文区 Ctrl+V 粘贴即可保留排版");
    else message.error("复制失败，可在预览里手动选中内容按 Ctrl+C");
  };

  const enabled = accounts.filter((a) => a.enabled);
  const pushed = articles.filter((a) => a.status === "pushed").length;
  const today = articles.filter((a) => a.created_at?.startsWith(todayStr())).length;
  const rate = articles.length ? Math.round((pushed / articles.length) * 100) : null;
  const schedule = [...enabled].sort((a, b) => a.gen_time.localeCompare(b.gen_time));

  const isAdmin = me?.role === "admin";
  const ownerOptions = [...new Set(accounts.map((a) => a.owner).filter(Boolean))];
  const filtered = articles.filter(
    (a) =>
      (!fAccount || a.account_id === fAccount) &&
      (!fOwner || a.owner === fOwner) &&
      (!fStatus || a.status === fStatus)
  );

  const columns: ColumnsType<Article> = [
    {
      title: "时间",
      dataIndex: "created_at",
      width: 165,
      render: (v) => <span className="text-black/45 tabular-nums">{v}</span>,
    },
    { title: "账号", dataIndex: "account_name", width: 130 },
    ...(me?.role === "admin"
      ? ([
          {
            title: "用户",
            dataIndex: "owner",
            width: 110,
            render: (v: string) => (
              <span className="text-black/45">{v}</span>
            ),
          },
        ] as ColumnsType<Article>)
      : []),
    {
      title: "标题",
      dataIndex: "title",
      ellipsis: true,
      render: (v) => (
        <Tooltip title={v} placement="topLeft">
          {v}
        </Tooltip>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (v) => <Tag color={STATUS[v]?.color || "default"}>{STATUS[v]?.label || v}</Tag>,
    },
    {
      title: "备注",
      dataIndex: "media_id",
      width: 200,
      ellipsis: true,
      render: (_, a) => <span className="text-black/40">{a.error || a.media_id || "-"}</span>,
    },
    {
      title: "操作",
      width: 80,
      render: (_, a) => (
        <Button
          size="small"
          type="link"
          icon={<EyeOutlined />}
          disabled={a.status !== "pushed"}
          onClick={() => openPreview(a)}
        >
          预览
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-bold m-0">运营总览</h1>
          <p className="text-[13px] text-black/40 mt-1 mb-0">账号、产出与今日排期，一屏掌握。</p>
        </div>
      </div>

      {/* 数据卡 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<TeamOutlined />}
          tile="bg-[#eef2ff] text-[#4f46e5]"
          value={accounts.length}
          label="接入账号"
          sub={`${enabled.length} 个启用中`}
        />
        <StatCard
          icon={<FileTextOutlined />}
          tile="bg-[#e0f2fe] text-[#0284c7]"
          value={me?.total_generated ?? articles.length}
          label="累计生成"
          sub={`近7天 ${articles.length} 篇 · ${pushed} 篇已推送`}
        />
        <StatCard
          icon={<RocketOutlined />}
          tile="bg-[#fef3c7] text-[#d97706]"
          value={today}
          label="今日生成"
          sub="篇"
        />
        <StatCard
          icon={<CheckCircleOutlined />}
          tile="bg-[#d1fae5] text-[#059669]"
          value={rate === null ? "—" : `${rate}%`}
          label="推送成功率"
          sub={articles.length ? `${pushed}/${articles.length}` : "暂无记录"}
        />
      </div>

      {/* 主区：记录表 + 右栏 */}
      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <Card
          variant="borderless"
          className="gzh-card lg:col-span-2"
          styles={{ body: { padding: "6px 8px 8px" } }}
          title={
            <span className="gzh-h">
              生成记录 <span className="text-[11px] font-normal text-black/30">（仅保留最近 7 天，推送成功后存于公众号草稿箱）</span>
            </span>
          }
          extra={
            <Link href="/accounts" className="text-[13px] text-[#4f46e5] hover:text-[#4338ca]">
              管理账号 <RightOutlined style={{ fontSize: 10 }} />
            </Link>
          }
        >
          {/* 筛选：账号 / 用户(admin) / 状态 */}
          <div className="flex flex-wrap items-center gap-2 px-2 pt-2 pb-3">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="按账号筛选"
              style={{ minWidth: 170 }}
              value={fAccount}
              onChange={(v) => setFAccount(v)}
              options={accounts.map((a) => ({
                value: a.id,
                label: isAdmin ? `${a.name}（${a.owner}）` : a.name,
              }))}
            />
            {isAdmin && ownerOptions.length > 1 && (
              <Select
                allowClear
                placeholder="按用户筛选"
                style={{ minWidth: 140 }}
                value={fOwner}
                onChange={(v) => setFOwner(v)}
                options={ownerOptions.map((o) => ({ value: o, label: o }))}
              />
            )}
            <Select
              allowClear
              placeholder="按状态"
              style={{ minWidth: 120 }}
              value={fStatus}
              onChange={(v) => setFStatus(v)}
              options={[
                { value: "pushed", label: "已推送" },
                { value: "failed", label: "失败" },
                { value: "generating", label: "生成中" },
                { value: "queued", label: "排队中" },
                { value: "skipped", label: "跳过未写" },
              ]}
            />
            <span className="text-xs text-black/35 ml-auto tabular-nums">
              {filtered.length === articles.length ? `共 ${articles.length} 条` : `${filtered.length} / ${articles.length} 条`}
            </span>
          </div>
          <Table<Article>
            rowKey="id"
            columns={columns}
            dataSource={filtered}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            locale={{ emptyText: filtered.length === 0 && articles.length > 0 ? "当前筛选条件下没有记录" : "暂无记录，点右侧「快速生成」生成第一篇" }}
          />
        </Card>

        <div className="space-y-5">
          <Card
            variant="borderless"
            className="gzh-card"
            title={
              <span className="flex items-center gap-2">
                <ThunderboltFilled style={{ color: "#4f46e5" }} />
                快速生成
              </span>
            }
          >
            <div className="space-y-2.5">
              <Segmented
                block
                value={genType}
                onChange={(v) => setGenType(v as "auto" | "hotspot" | "upgrade" | "intro")}
                options={[
                  { value: "auto", label: "自动（git 优先）" },
                  { value: "hotspot", label: "热点文" },
                  { value: "upgrade", label: "升级文" },
                  { value: "intro", label: "置顶名片文" },
                ]}
              />
              <Input.TextArea
                placeholder={
                  genType === "auto"
                    ? "自动模式：仓库有新提交就写升级文（按改动路径点明 3.0 抖音版 / 4.0 独立版），没有才写热点文。\n下方素材选填：粘贴热点链接、客户反馈、想写的观点…填了就优先围绕它写。"
                    : genType === "hotspot"
                      ? "本期素材（选填）：粘贴热点链接、客户反馈、想写的观点…\n填了就围绕它写；留空则自动搜近两周热点。对下面所有账号生效。"
                      : genType === "upgrade"
                        ? "提交记录（选填）：留空 = 自动读取服务器仓库里上次写文之后的新提交（开发机 git push 后生效）；也可手动粘贴 git log 覆盖。"
                        : "置顶名片文：为每个号生成主页置顶用的产品介绍（按各号人设自动换角度，讲技术取舍不讲实现）。\n发表后在公众号后台把这篇设为「置顶」。素材选填：想强调的卖点、客户案例。"
                }
                autoSize={{ minRows: 3, maxRows: 8 }}
                maxLength={8000}
                value={genContent}
                onChange={(e) => setGenContent(e.target.value)}
              />
              {enabled.map((a) => (
                <Button
                  key={a.id}
                  block
                  type="primary"
                  ghost
                  icon={<ThunderboltFilled />}
                  loading={busy === a.id}
                  onClick={() => gen(a.id, a.name)}
                  className="!flex !justify-between !items-center !px-4"
                >
                  <span>为「{a.name}」生成</span>
                  <RightOutlined style={{ fontSize: 10 }} />
                </Button>
              ))}
              {enabled.length === 0 && (
                <div className="text-[13px] text-black/40 leading-relaxed">
                  还没有启用的账号，先到{" "}
                  <Link href="/accounts" className="text-[#4f46e5]">
                    账号管理
                  </Link>{" "}
                  添加。
                </div>
              )}
            </div>
          </Card>

          <Card
            variant="borderless"
            className="gzh-card"
            title={
              <span className="flex items-center gap-2">
                <ClockCircleOutlined style={{ color: "#4f46e5" }} />
                今日排期
              </span>
            }
          >
            <div className="space-y-1">
              {schedule.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#f8f9fb] transition"
                >
                  <span className="text-[13px] font-semibold tabular-nums text-[#4f46e5] bg-[#eef2ff] rounded-md px-2 py-0.5">
                    {a.gen_time}
                  </span>
                  <span className="text-[13px] text-[#111827] truncate flex-1">{a.name}</span>
                  <span className="text-[11px] text-black/35 shrink-0">{a.role === "main" ? "主号" : "副号"}</span>
                </div>
              ))}
              {schedule.length === 0 && <div className="text-[13px] text-black/35">暂无启用账号的定时任务</div>}
            </div>
            <p className="text-[11px] text-black/30 mt-3 mb-0 leading-relaxed">
              同一时间多号会自动错峰排队（间隔约 2 分钟），无需手动错开。
            </p>
          </Card>
        </div>
      </div>

      {/* 文章预览 */}
      <Modal
        open={preview.open}
        title={<span className="text-[15px]">{preview.title || "文章预览"}</span>}
        footer={null}
        width={760}
        onCancel={() => setPreview((p) => ({ ...p, open: false }))}
        styles={{ body: { padding: 0 } }}
      >
        {preview.loading && (
          <div className="py-24 text-center text-[13px] text-black/40">加载中…</div>
        )}
        {!preview.loading && preview.data?.error && (
          <div className="py-24 text-center text-[13px] text-black/45">{preview.data.error}</div>
        )}
        {!preview.loading && preview.data?.html && (
          <div>
            {preview.data.note && (
              <div className="px-4 py-2 text-xs text-[#d97706] bg-[#fffbeb] border-b border-[#fde68a]">
                {preview.data.note}
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-2 border-b border-black/5">
              <span className="text-[11px] text-black/35">
                实际推送内容为此排版 HTML；推送后也可在公众号后台草稿箱查看。
              </span>
              <div className="flex items-center gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadMedia("cover", [f]);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={contentInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fs = Array.from(e.target.files || []);
                    if (fs.length) uploadMedia("content", fs);
                    e.target.value = "";
                  }}
                />
                <Button size="small" icon={<PictureOutlined />} loading={mediaBusy} onClick={() => coverInputRef.current?.click()}>
                  换封面
                </Button>
                <Button size="small" icon={<PictureOutlined />} loading={mediaBusy} onClick={() => contentInputRef.current?.click()}>
                  插入图片
                </Button>
                <Dropdown
                  menu={libMenu}
                  trigger={["click"]}
                  onOpenChange={(open) => {
                    if (open && preview.accountId && libFor !== preview.accountId) loadLib(preview.accountId);
                  }}
                >
                  <Button size="small" icon={<AppstoreOutlined />} loading={mediaBusy}>
                    从素材库选图
                  </Button>
                </Dropdown>
                <Button size="small" type="primary" ghost icon={<CopyOutlined />} onClick={copyPreview}>
                  复制全文
                </Button>
              </div>
            </div>
            <div className="flex justify-center bg-[#ebedf0] py-4" style={{ maxHeight: "70vh", overflow: "auto" }}>
              <iframe
                title="article-preview"
                sandbox=""
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;">${preview.data.html}</body></html>`}
                style={{ width: 414, height: "66vh", border: "none", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.12)" }}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
