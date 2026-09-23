"use client";
import { useEffect, useRef, useState } from "react";
import {
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Badge,
  App,
  Row,
  Col,
  Segmented,
  Empty,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
  CopyOutlined,
  CheckOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  UploadOutlined,
  PushpinOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { copyToClipboard } from "@/lib/clipboard";

interface Account {
  id?: number;
  name: string;
  appid: string;
  appsecret: string;
  role: string;
  identity: string;
  direction: string;
  audience: string;
  ideas: string;
  ending: string;
  follow_system: number;
  promo: number;
  hotspot_prompt: string;
  upgrade_prompt: string;
  gen_time: string;
  enabled: number;
}
interface Material {
  id: number;
  account_id: number;
  type: "cover" | "content";
  file: string;
  name: string;
  ref: string;
  added_at: string;
}

type MatType = "cover" | "content";
const TYPE_LABEL: Record<MatType, string> = { cover: "封面", content: "文章内容" };

const SERVER_IP = "103.185.249.166";
const EMPTY: Account = {
  name: "", appid: "", appsecret: "", role: "sub",
  identity: "", direction: "", audience: "", ideas: "",
  ending: "", follow_system: 1, promo: 1, hotspot_prompt: "", upgrade_prompt: "",
  gen_time: "23:30", enabled: 1,
};

const linkBtn = "px-3 py-1.5 rounded-lg text-xs border border-[#e5e7eb] bg-white text-black/60 hover:border-[#4f46e5]/40 hover:text-[#4f46e5] transition inline-flex items-center gap-1.5";

// 推送时间只开放凌晨档：22:00～次日 05:00，每 30 分钟一档（与后端校验、定时器 HH:mm 匹配一致）
const GEN_TIME_OPTIONS = [
  "22:00", "22:30", "23:00", "23:30",
  "00:00", "00:30", "01:00", "01:30",
  "02:00", "02:30", "03:00", "03:30",
  "04:00", "04:30", "05:00",
];

export default function Accounts() {
  const { message, modal } = App.useApp();
  const [list, setList] = useState<Account[]>([]);
  const [editing, setEditing] = useState<Account | null>(null);
  const [ipCopied, setIpCopied] = useState(false);
  const [form] = Form.useForm();

  // 提示词弹窗（本账号自定义写作模板）
  const [promptAcc, setPromptAcc] = useState<Account | null>(null);
  const [promptForm] = Form.useForm();
  const promptFollow = Form.useWatch("follow_system", promptForm);
  const promoFollow = Form.useWatch("promo", promptForm);

  // 素材库弹窗（本号专属素材）
  const [matAcc, setMatAcc] = useState<Account | null>(null);
  const [matType, setMatType] = useState<MatType>("cover");
  const [mats, setMats] = useState<Material[]>([]);
  const [matPinned, setMatPinned] = useState("");
  const [matUploadBusy, setMatUploadBusy] = useState(false);
  const [matBusy, setMatBusy] = useState<number | null>(null);
  const matFileRef = useRef<HTMLInputElement>(null);

  const loadTemplates = async () => {
    const rows = await (await fetch("/api/prompts")).json();
    return {
      hotspot: rows.find((r: { type: string }) => r.type === "hotspot")?.content || "",
      upgrade: rows.find((r: { type: string }) => r.type === "upgrade")?.content || "",
    };
  };

  const fillSystemTemplates = async () => {
    const t = await loadTemplates();
    const cur = promptForm.getFieldsValue(["hotspot_prompt", "upgrade_prompt"]);
    promptForm.setFieldsValue({
      hotspot_prompt: cur.hotspot_prompt?.trim() || t.hotspot,
      upgrade_prompt: cur.upgrade_prompt?.trim() || t.upgrade,
    });
    message.success("已填入系统模板底稿，可自由修改");
  };

  // 复制失败时（浏览器拦截自动复制）弹窗展示 IP，保证按钮永不假成功
  const copyIp = async () => {
    if (await copyToClipboard(SERVER_IP)) {
      setIpCopied(true);
      setTimeout(() => setIpCopied(false), 1500);
    } else {
      modal.info({
        title: "浏览器拦截了自动复制，请手动复制",
        content: (
          <div className="mt-2 select-all rounded bg-black/5 px-3 py-2 font-mono text-sm">
            {SERVER_IP}
          </div>
        ),
        okText: "知道了",
      });
    }
  };

  const load = async () => setList(await (await fetch("/api/accounts")).json());
  useEffect(() => { load(); }, []);

  const open = (a: Account) => {
    setEditing(a);
    form.setFieldsValue({ ...a });
  };

  const save = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    // 前端兜底：粘贴常带首尾空白（前导空格 appid → 微信 40013 invalid appid），提交前统一 trim（后端 API 还有同名一层）
    const vals: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) vals[k] = typeof v === "string" ? v.trim() : v;
    const res = await fetch("/api/accounts", {
      method: editing.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editing, ...vals }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      message.error(err.error || "保存失败");
      return;
    }
    message.success(editing.id ? "账号已更新" : "账号已添加");
    setEditing(null);
    load();
  };

  const del = (a: Account) => {
    if (!a.id) return;
    modal.confirm({
      title: `确认删除账号「${a.name}」？`,
      content: "删除后不可恢复，其定时任务与生成记录将不再可用。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await fetch("/api/accounts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: a.id }),
        });
        message.success("已删除");
        load();
      },
    });
  };

  // ---- 提示词弹窗 ----
  const openPrompts = (a: Account) => {
    setPromptAcc(a);
    promptForm.setFieldsValue({
      promo: a.promo !== 0,
      follow_system: a.follow_system !== 0,
      hotspot_prompt: a.hotspot_prompt || "",
      upgrade_prompt: a.upgrade_prompt || "",
    });
  };

  const savePrompts = async () => {
    if (!promptAcc?.id) return;
    const values = await promptForm.validateFields();
    const payload: Record<string, unknown> = {
      id: promptAcc.id,
      promo: values.promo ? 1 : 0,
      hotspot_prompt: (values.hotspot_prompt || "").trim(),
    };
    // 独立模式下不提交 follow_system/upgrade_prompt——保持原值，切回推广体系时不受影响
    if (values.promo) {
      payload.follow_system = values.follow_system ? 1 : 0;
      payload.upgrade_prompt = (values.upgrade_prompt || "").trim();
    }
    const res = await fetch("/api/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      message.error(err.error || "保存失败");
      return;
    }
    message.success("提示词已保存");
    setPromptAcc(null);
    load();
  };

  // ---- 素材库弹窗 ----
  const loadMats = async (id: number, t: MatType) => {
    const r = await (await fetch(`/api/materials?account_id=${id}&type=${t}`)).json();
    setMats(r.materials || []);
    setMatPinned(r.custom_cover_media_id || "");
  };
  const openMaterials = (a: Account) => {
    if (!a.id) return;
    setMatAcc(a);
    setMatType("cover");
    loadMats(a.id, "cover");
  };

  const uploadMats = async (files: FileList | null) => {
    if (!matAcc?.id || !files?.length) return;
    setMatUploadBusy(true);
    const fd = new FormData();
    fd.append("account_id", String(matAcc.id));
    fd.append("type", matType);
    Array.from(files).forEach((f) => fd.append("files", f));
    try {
      const r = await (await fetch("/api/materials", { method: "POST", body: fd })).json();
      if (r.ok) {
        message.success(r.msg);
        await loadMats(matAcc.id, matType);
      } else message.error(r.error || "上传失败");
    } finally {
      setMatUploadBusy(false);
    }
  };

  const pinMat = async (m: Material) => {
    setMatBusy(m.id);
    try {
      const r = await (await fetch("/api/materials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, action: "pin" }),
      })).json();
      if (r.ok) {
        message.success(r.msg);
        if (matAcc?.id) await loadMats(matAcc.id, matType);
      } else message.error(r.error || "操作失败");
    } finally {
      setMatBusy(null);
    }
  };

  const unpinMat = async () => {
    if (!matAcc?.id) return;
    const r = await (await fetch("/api/materials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: matAcc.id, action: "unpin" }),
    })).json();
    if (r.ok) {
      message.success(r.msg);
      await loadMats(matAcc.id, matType);
    } else message.error(r.error || "操作失败");
  };

  const removeMat = (m: Material) => {
    modal.confirm({
      title: `移除素材「${m.name}」？`,
      content:
        m.type === "cover"
          ? "会同时清理微信侧已转存的素材；若本号固定了它，固定会同步取消。"
          : "只从素材库移除；已插入文章的图片不受影响。",
      okText: "移除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        setMatBusy(m.id);
        try {
          const r = await (await fetch("/api/materials", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: m.id }),
          })).json();
          if (r.ok) {
            message.success(r.msg);
            if (matAcc?.id) await loadMats(matAcc.id, matType);
          } else message.error(r.error || "移除失败");
        } finally {
          setMatBusy(null);
        }
      },
    });
  };

  const copyRef = async (m: Material) => {
    if (!m.ref) return;
    if (await copyToClipboard(m.ref)) message.success("直链已复制");
    else message.error("复制失败，请手动复制直链");
  };

  const columns: ColumnsType<Account> = [
    {
      title: "名称",
      dataIndex: "name",
      width: 200,
      render: (v, a) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#8b5cf6] text-white flex items-center justify-center text-[13px] font-semibold shrink-0">
            {v?.[0] || "?"}
          </div>
          <div className="leading-tight min-w-0">
            <div className="font-medium truncate">
              {v}
              {a.promo === 0 ? (
                <Tag color="cyan" style={{ marginLeft: 6, marginRight: 0, fontSize: 11, lineHeight: "16px" }}>
                  独立写作
                </Tag>
              ) : a.follow_system === 0 ? (
                <Tag color="purple" style={{ marginLeft: 6, marginRight: 0, fontSize: 11, lineHeight: "16px" }}>
                  自定口径
                </Tag>
              ) : null}
            </div>
            <Tag color={a.role === "main" ? "gold" : "blue"} style={{ marginRight: 0, marginTop: 2, fontSize: 11, lineHeight: "16px" }}>
              {a.role === "main" ? "主号" : "副号"}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: "人设定位",
      dataIndex: "identity",
      render: (_, a) => (
        <div className="leading-snug">
          <div className="truncate text-[13px]">{a.identity}</div>
          <div className="truncate text-xs text-black/40 mt-0.5">{a.direction}</div>
        </div>
      ),
    },
    {
      title: "受众",
      dataIndex: "audience",
      width: 180,
      ellipsis: true,
      render: (v) => <span className="text-black/55 text-[13px]">{v}</span>,
    },
    {
      title: "定时",
      dataIndex: "gen_time",
      width: 90,
      render: (v) => <span className="tabular-nums text-[13px] font-semibold text-[#4f46e5]">{v}</span>,
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 90,
      render: (v) =>
        v ? (
          <Badge status="processing" color="#10b981" text={<span className="text-[13px]">启用</span>} />
        ) : (
          <Badge status="default" text={<span className="text-[13px] text-black/40">停用</span>} />
        ),
    },
    {
      title: "操作",
      width: 240,
      render: (_, a) => (
        <div className="grid grid-cols-2 gap-x-1 gap-y-0.5" style={{ width: 190 }}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(a)}>
            编辑
          </Button>
          <Button type="text" size="small" icon={<FileTextOutlined />} onClick={() => openPrompts(a)}>
            提示词
          </Button>
          <Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={() => openMaterials(a)}>
            素材库
          </Button>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => del(a)}>
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-bold m-0">账号管理</h1>
          <p className="text-[13px] text-black/40 mt-1 mb-0">接入公众号，配置人设与每日定时推送；提示词与素材库按号独立管理。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open({ ...EMPTY })} className="gzh-btn-glow">
          添加账号
        </Button>
      </div>

      <div className="gzh-card overflow-hidden p-2">
        <Table<Account>
          rowKey="id"
          columns={columns}
          dataSource={list}
          pagination={false}
          locale={{ emptyText: "暂无账号，点右上角「添加账号」开始接入" }}
        />
      </div>

      <Modal
        open={!!editing}
        title={<span className="font-bold">{editing?.id ? "编辑账号" : "添加账号"}</span>}
        onCancel={() => setEditing(null)}
        onOk={save}
        okText="保存"
        cancelText="取消"
        width={660}
        centered
        styles={{ body: { maxHeight: "calc(100vh - 220px)", overflowY: "auto", paddingRight: 4 } }}
        destroyOnHidden
      >
        {/* 快捷操作 */}
        <div className="rounded-xl border border-[#4f46e5]/15 bg-[#eef2ff]/50 p-4 space-y-2.5 mt-1 mb-5">
          <div className="text-xs font-bold text-[#4f46e5]">快捷操作 · 配置这个号需要的东西都在微信后台</div>
          <div className="flex flex-wrap gap-2">
            <a href="https://mp.weixin.qq.com/" target="_blank" rel="noreferrer" className={linkBtn}>
              <ExportOutlined style={{ fontSize: 11 }} /> 登录公众平台
            </a>
            <a href="https://developers.weixin.qq.com/platform/" target="_blank" rel="noreferrer" className={linkBtn}>
              <ExportOutlined style={{ fontSize: 11 }} /> 开发者平台（AppSecret / IP 白名单）
            </a>
            <button type="button" onClick={copyIp} className={linkBtn}>
              {ipCopied ? <CheckOutlined style={{ fontSize: 11, color: "#059669" }} /> : <CopyOutlined style={{ fontSize: 11 }} />}
              {ipCopied ? "已复制" : `复制服务器 IP（${SERVER_IP}）`}
            </button>
          </div>
          <p className="text-[11px] text-black/40 leading-relaxed m-0">
            流程：登录公众平台拿 AppID → 开发者平台「基础信息 → 开发密钥」生成 AppSecret → 同页把服务器 IP 加入白名单 → 回这里填入保存。
          </p>
        </div>

        <Form form={form} layout="vertical" className="space-y-0">
          <Form.Item name="name" label="账号名称" rules={[{ required: true, message: "请输入公众号昵称" }]} style={{ marginBottom: 14 }}>
            <Input placeholder="公众号昵称" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="appid" label="AppID" rules={[{ required: true, message: "请输入 AppID" }]} style={{ marginBottom: 14 }}>
                <Input placeholder="wx 开头" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="appsecret" label="AppSecret" rules={[{ required: true, message: "请输入 AppSecret" }]} style={{ marginBottom: 14 }}>
                <Input.Password placeholder="开发者平台的开发密钥" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="identity"
            label={
              <span>
                身份 <span className="text-[#ef4444]">*</span>
              </span>
            }
            rules={[{ required: true, message: "身份必填，决定文章的人设口吻" }]}
            style={{ marginBottom: 14 }}
          >
            <Input placeholder="如：帮装修商家做抖音获客的软件开发者（写进每篇文章的人设）" />
          </Form.Item>
          <Form.Item
            name="direction"
            label={
              <span>
                内容方向 <span className="text-[#ef4444]">*</span>
              </span>
            }
            rules={[{ required: true, message: "内容方向必填" }]}
            style={{ marginBottom: 14 }}
          >
            <Input placeholder="如：本地商家抖音截流获客打法与案例" />
          </Form.Item>
          <Form.Item
            name="audience"
            label={
              <span>
                受众人群 <span className="text-[#ef4444]">*</span>
              </span>
            }
            rules={[{ required: true, message: "受众人群必填" }]}
            style={{ marginBottom: 14 }}
          >
            <Input placeholder="如：装修/家居行业的小老板和个体创业者" />
          </Form.Item>
          <Form.Item name="ideas" label="想法 / 素材" extra="选填。粘贴进来的想法会融入文章，可留空。" style={{ marginBottom: 14 }}>
            <Input.TextArea rows={3} placeholder="最近的一些想法、想强调的点、客户反馈…" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="role" label="角色" style={{ marginBottom: 14 }}>
                <Select
                  options={[
                    { value: "sub", label: "副号（自动热点文）" },
                    { value: "main", label: "主号" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item
                name="gen_time"
                label="每日推送时间"
                extra="仅可选凌晨档：22:00～次日 05:00。多号设同一时间也会自动错峰排队（间隔约 2 分钟）。"
                style={{ marginBottom: 14 }}
              >
                <Select
                  options={GEN_TIME_OPTIONS.map((t) => ({ value: t, label: t }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="ending"
            label="固定结尾"
            extra="留空用默认版（点关注引导）。写作模板与固定结尾在列表「提示词」里按号配置。"
            style={{ marginBottom: 14 }}
          >
            <Input.TextArea rows={3} placeholder="每篇文章末尾固定出现的话术" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ marginBottom: 14 }}>
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          {editing && editing.id ? (
            <div className="rounded-lg bg-[#fafbfc] border border-[#eef0f3] px-3.5 py-2.5 text-xs text-black/45 leading-relaxed">
              写作模板在列表「<span className="text-[#4f46e5] font-semibold">提示词</span>」按号配置；
              封面与正文配图在「<span className="text-[#4f46e5] font-semibold">素材库</span>」按号上传：
              封面生成时随机选用或固定一张，正文配图可在文章预览里一键插入。
            </div>
          ) : null}
        </Form>
      </Modal>

      {/* 提示词弹窗：本账号自定义写作模板 */}
      <Modal
        open={!!promptAcc}
        title={<span className="font-bold">提示词 · {promptAcc?.name}</span>}
        onCancel={() => setPromptAcc(null)}
        onOk={savePrompts}
        okText="保存"
        cancelText="取消"
        width={720}
        centered
        styles={{ body: { maxHeight: "calc(100vh - 220px)", overflowY: "auto", paddingRight: 4 } }}
        destroyOnHidden
      >
        <Form form={promptForm} layout="vertical" className="space-y-0">
          <Form.Item
            name="promo"
            label="跟随万流汇推广体系"
            valuePropName="checked"
            extra={
              promoFollow === false
                ? "独立写作模式：整份提示词由你完全自定义，系统不再附加任何万流汇口径——中性系统提示词、不追加统一结尾（只认本号自己填的固定结尾）、自动封面不带产品署名、升级文/置顶名片文不可用。"
                : "账号纳入万流汇矩阵营销体系：系统口径、矩阵去重、统一结尾、产品升级文全套生效。关掉即为独立写作。"
            }
            style={{ marginBottom: 14 }}
          >
            <Switch checkedChildren="推广体系" unCheckedChildren="独立写作" />
          </Form.Item>
          {promoFollow === false ? (
            <>
              <p className="text-xs text-black/45 leading-relaxed rounded-lg bg-[#fafbfc] border border-[#eef0f3] px-3.5 py-2.5 mt-1 mb-4">
                下面这份就是发给模型的<strong>完整提示词</strong>（不会再拼接系统模板）。
                可用变量：<code>{"{ACCOUNT_NAME}"}</code> <code>{"{IDENTITY}"}</code> <code>{"{DIRECTION}"}</code>{" "}
                <code>{"{AUDIENCE}"}</code> <code>{"{IDEAS}"}</code> <code>{"{TODAY}"}</code> <code>{"{REDFOX_DATA}"}</code>{" "}
                <code>{"{FESTIVAL}"}</code>；留空则用一份只含人设三件套的中性默认提示词。
                系统仍会额外附上「矩阵去重红线」（防止和矩阵其他号写重）。
              </p>
              <Form.Item
                name="hotspot_prompt"
                label="整篇提示词（独立模式 · 热点文）"
                style={{ marginBottom: 14 }}
              >
                <Input.TextArea rows={14} style={{ fontFamily: "monospace", fontSize: 12 }} placeholder={`你是公众号「{ACCOUNT_NAME}」的主笔，专注…\n今天写一篇…（选题、结构、口吻、字数、输出格式都由你定）`} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="follow_system"
                label="跟随系统写作口径"
                valuePropName="checked"
                extra={
                  promptFollow === false
                    ? "此号使用下方自己的提示词模板（留空的文类仍用系统版）。"
                    : "使用系统统一口径（git 优先升级文、版本对照、红线规则）。关闭可自定义本号的提示词模板。"
                }
                style={{ marginBottom: 14 }}
              >
                <Switch checkedChildren="跟随系统" unCheckedChildren="自己指定" />
              </Form.Item>
              {promptFollow === false && (
                <>
                  <Form.Item style={{ marginBottom: 14 }}>
                    <Button size="small" onClick={fillSystemTemplates}>
                      填入系统模板作底稿
                    </Button>
                  </Form.Item>
                  <Form.Item
                    name="hotspot_prompt"
                    label="热点文模板（自定义）"
                    extra="可用变量：{ACCOUNT_NAME} {IDENTITY} {DIRECTION} {AUDIENCE} {IDEAS} {TODAY} {REDFOX_DATA} {FESTIVAL}；留空用系统版。"
                    style={{ marginBottom: 14 }}
                  >
                    <Input.TextArea rows={9} style={{ fontFamily: "monospace", fontSize: 12 }} placeholder="留空 = 使用系统热点文模板" />
                  </Form.Item>
                  <Form.Item
                    name="upgrade_prompt"
                    label="升级文模板（自定义）"
                    extra="git 提交清单会附在文末（含改动路径）。留空用系统版。"
                    style={{ marginBottom: 14 }}
                  >
                    <Input.TextArea rows={9} style={{ fontFamily: "monospace", fontSize: 12 }} placeholder="留空 = 使用系统升级文模板" />
                  </Form.Item>
                </>
              )}
            </>
          )}
        </Form>
      </Modal>

      {/* 素材库弹窗：本号专属素材（1-1 绑定） */}
      <Modal
        open={!!matAcc}
        title={<span className="font-bold">素材库 · {matAcc?.name}</span>}
        onCancel={() => setMatAcc(null)}
        footer={null}
        width={860}
        centered
        styles={{ body: { maxHeight: "calc(100vh - 220px)", overflowY: "auto", paddingRight: 4 } }}
        destroyOnHidden
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <Segmented
            value={matType}
            onChange={(v) => {
              const t = v as MatType;
              setMatType(t);
              if (matAcc?.id) loadMats(matAcc.id, t);
            }}
            options={[
              { value: "cover", label: "封面" },
              { value: "content", label: "文章内容" },
            ]}
          />
          <input
            ref={matFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              uploadMats(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={matUploadBusy}
            disabled={!matAcc?.id}
            onClick={() => matFileRef.current?.click()}
          >
            上传{TYPE_LABEL[matType]}素材
          </Button>
        </div>

        {matType === "cover" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#eef2ff]/60 border border-[#4f46e5]/10 px-4 py-3">
              <span className="text-xs font-bold text-[#4f46e5]">生成取图规则</span>
              <span className="text-xs text-black/50">
                固定封面 &gt; 随机（本号现有 {mats.length} 张）&gt; 自动生成（900×383 比例最佳）
              </span>
              <span className="flex-1" />
              {matPinned ? (
                <>
                  <Tag color="green" style={{ marginInlineEnd: 0 }}>固定封面模式</Tag>
                  <Button size="small" onClick={unpinMat}>取消固定（改随机）</Button>
                </>
              ) : mats.length ? (
                <Tag color="blue" style={{ marginInlineEnd: 0 }}>随机模式 · {mats.length} 张</Tag>
              ) : (
                <Tag style={{ marginInlineEnd: 0 }}>自动生成模式</Tag>
              )}
            </div>

            {mats.length ? (
              <div className="flex flex-wrap gap-4">
                {mats.map((m) => {
                  const isPinned = matPinned === m.ref;
                  return (
                    <div
                      key={m.id}
                      className={`relative group rounded-xl overflow-hidden border-2 bg-[#f8f9fb] transition ${
                        isPinned ? "border-[#10b981]" : "border-transparent hover:border-black/10"
                      }`}
                      style={{ width: 224 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/materials/image?account_id=${m.account_id}&file=${encodeURIComponent(m.file)}`} alt={m.name} className="block w-full" style={{ aspectRatio: "2.35/1", objectFit: "cover" }} />
                      {isPinned && (
                        <Tag color="green" className="absolute top-1.5 left-1.5" style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "16px" }}>
                          固定封面
                        </Tag>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                        {!isPinned && (
                          <Button size="small" type="primary" ghost icon={<PushpinOutlined />} loading={matBusy === m.id} onClick={() => pinMat(m)}>
                            设为固定
                          </Button>
                        )}
                        <Button size="small" danger icon={<DeleteOutlined />} loading={matBusy === m.id} onClick={() => removeMat(m)} />
                      </div>
                      <div className="px-2.5 py-1.5 text-[11px] text-black/40 truncate" title={m.name}>{m.name}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  matPinned
                    ? "当前用固定封面（此前单独设置，不在列表里）；上传素材后可切换为随机模式"
                    : "本号还没有封面素材，上传后每次生成自动随机选一张"
                }
              />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#eef2ff]/60 border border-[#4f46e5]/10 px-4 py-3">
              <span className="text-xs font-bold text-[#4f46e5]">用途</span>
              <span className="text-xs text-black/50">
                文章预览里点「从素材库选图」直接插入本号文章正文；也可复制直链手动使用。
              </span>
            </div>
            {mats.length ? (
              <div className="flex flex-wrap gap-4">
                {mats.map((m) => (
                  <div key={m.id} className="relative group rounded-xl overflow-hidden border-2 border-transparent hover:border-black/10 bg-[#f8f9fb] transition" style={{ width: 150 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/materials/image?account_id=${m.account_id}&file=${encodeURIComponent(m.file)}`} alt={m.name} className="block w-full" style={{ aspectRatio: "1/1", objectFit: "cover" }} />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      {m.ref && (
                        <Button size="small" ghost icon={<CopyOutlined />} onClick={() => copyRef(m)} />
                      )}
                      <Button size="small" danger icon={<DeleteOutlined />} loading={matBusy === m.id} onClick={() => removeMat(m)} />
                    </div>
                    <div className="px-2.5 py-1.5 text-[11px] text-black/40 truncate" title={m.name}>{m.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="inline-flex items-center gap-1.5"><PictureOutlined /> 本号还没有正文配图素材</span>} />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
