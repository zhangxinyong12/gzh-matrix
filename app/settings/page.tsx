"use client";
import { useEffect, useState } from "react";
import { Card, Form, Input, Button, App, Select, Switch, InputNumber, Table, Tag } from "antd";
import { SaveOutlined, InfoCircleOutlined, GiftOutlined } from "@ant-design/icons";

interface Me {
  user: string;
  role: string;
}

interface ThemeOption {
  id: string;
  name: string;
  scenes: string;
}

interface ShareInfo {
  enabled: boolean;
  used: number;
  quota: number;
  available: boolean;
}

interface ShareUsage {
  username: string;
  used: number;
}

export default function Settings() {
  const { message } = App.useApp();
  const [form, setForm] = useState<Record<string, string>>({});
  const [me, setMe] = useState<Me | null>(null);
  const [themes, setThemes] = useState<ThemeOption[]>([]);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareQuota, setShareQuota] = useState<number>(30);
  const [shareUsage, setShareUsage] = useState<ShareUsage[]>([]);
  const [share, setShare] = useState<ShareInfo | null>(null);

  const load = () => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setThemes(d.themes || []);
        setShare(d.share || null);
        setShareUsage(d.key_share_usage || []);
        setShareEnabled(!!d.key_share_enabled);
        setShareQuota(Number(d.key_share_quota) || 30);
        const { share, key_share_usage, key_share_enabled, key_share_quota, ...rest } = d;
        void share; void key_share_usage; void key_share_enabled; void key_share_quota;
        setForm(rest as Record<string, string>);
      });
  };
  useEffect(() => {
    load();
    fetch("/api/me").then((r) => r.json()).then(setMe);
  }, []);

  const save = async () => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, key_share_enabled: shareEnabled, key_share_quota: shareQuota }),
    });
    message.success("已保存");
    load();
  };

  const isPersonal = me && me.role !== "admin";
  const ownKeySet = !!form.deepseek_key;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-[22px] font-bold m-0">{isPersonal ? "个人设置" : "系统设置"}</h1>
        <p className="text-[13px] text-black/40 mt-1 mb-0">
          {isPersonal
            ? "你的 DeepSeek Key 只用于你名下账号的文章生成，与管理员、其他用户互不共用。"
            : "管理员的模型配置，用于 admin 名下账号；子用户各配各的 Key，互不共用。"}
        </p>
      </div>

      <Card variant="borderless" className="gzh-card">
        <div className="flex items-center gap-2 mb-5">
          <span className="gzh-h">{isPersonal ? "我的 DeepSeek Key" : "模型配置"}</span>
        </div>
        <Form layout="vertical" className="max-w-lg">
          <Form.Item
            label="DeepSeek API Key"
            extra={isPersonal ? "一个人一个 Key，名下所有账号共用这一个。" : "admin 名下账号使用；子用户在各自的「设置」页配置。"}
            style={{ marginBottom: isPersonal ? 0 : 16 }}
          >
            <Input.Password
              placeholder="sk-..."
              value={form.deepseek_key || ""}
              onChange={(e) => setForm({ ...form, deepseek_key: e.target.value })}
            />
          </Form.Item>
          {!isPersonal && (
            <>
              <Form.Item
                label="微信爆文搜索 Key（Redfox）"
                extra="Redfox（redfox.hk）微信公众号爆文搜索，用于热点文选题检索；全矩阵共用，仅管理员可配。留空不影响现有生成流程。"
                style={{ marginBottom: 16 }}
              >
                <Input.Password
                  placeholder="ak_..."
                  value={form.redfox_key || ""}
                  onChange={(e) => setForm({ ...form, redfox_key: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="DeepSeek 模型" style={{ marginBottom: 16 }}>
                <Input
                  placeholder="deepseek-chat（默认，可留空）"
                  value={form.deepseek_model || ""}
                  onChange={(e) => setForm({ ...form, deepseek_model: e.target.value })}
                />
              </Form.Item>
              <Form.Item
                label="文章排版主题"
                extra="生成管线用 gzh-design 排版引擎渲染 HTML；主题组件库来自 .agents/skills/gzh-design"
                style={{ marginBottom: 0 }}
              >
                <Select
                  value={form.typeset_theme || "moyu-green"}
                  onChange={(v) => setForm({ ...form, typeset_theme: v })}
                  options={themes.map((t) => ({
                    value: t.id,
                    label: `${t.name} — ${t.scenes}`,
                  }))}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Card>

      {/* 文章固定结尾（每人一份；admin 另有系统默认） */}
      <Card variant="borderless" className="gzh-card">
        <div className="flex items-center gap-2 mb-1">
          <span className="gzh-h">文章固定结尾</span>
        </div>
        <p className="text-[13px] text-black/40 mt-1 mb-5">
          每篇文章末尾自动追加的引导语。留空用系统通用版（关注 + 私信）；支持 **加粗**。
          优先级：账号单独设置的结尾 &gt; 这里的个人结尾 &gt; 系统默认。
        </p>
        <Form layout="vertical" className="max-w-lg">
          <Form.Item
            label={isPersonal ? "我的文章结尾" : "我的名下账号结尾"}
            extra={isPersonal ? "作用于你名下所有账号；某个账号想用别的结尾，去账号编辑里单独填。" : "作用于你名下的账号（如 daydayago 主副号保留业务版结尾就在这里维护）。"}
            style={{ marginBottom: isPersonal ? 0 : 16 }}
          >
            <Input.TextArea
              placeholder="例如：觉得有收获就**关注**我，有问题直接**私信**我，看到都会回。"
              autoSize={{ minRows: 3, maxRows: 8 }}
              value={form.ending_self || ""}
              onChange={(e) => setForm({ ...form, ending_self: e.target.value })}
            />
          </Form.Item>
          {!isPersonal && (
            <Form.Item
              label="系统默认结尾"
              extra="所有用户的兜底结尾；留空用内置通用版（关注 + 私信）。用户自己的结尾设置优先于这里。"
              style={{ marginBottom: 0 }}
            >
              <Input.TextArea
                placeholder="留空 = 内置通用版：以上就是本期的分享。觉得有收获的话，欢迎点个关注…"
                autoSize={{ minRows: 2, maxRows: 6 }}
                value={form.ending_default || ""}
                onChange={(e) => setForm({ ...form, ending_default: e.target.value })}
              />
            </Form.Item>
          )}
        </Form>
      </Card>

      {/* 推广期共享额度（仅 admin） */}
      {!isPersonal && (
        <Card variant="borderless" className="gzh-card">
          <div className="flex items-center gap-2 mb-1">
            <span className="gzh-h">推广期 · 全局 Key 共享</span>
            {shareEnabled ? (
              <Tag color="green" style={{ marginInlineEnd: 0 }}>已开放</Tag>
            ) : (
              <Tag style={{ marginInlineEnd: 0 }}>未开放</Tag>
            )}
          </div>
          <p className="text-[13px] text-black/40 mt-1 mb-5">
            开放后，还没配置自己 Key 的子用户可在免费额度内使用你的全局 Key 生成文章——方便前期拉人体验。他们配置自己的 Key 后，始终优先用自己的。
          </p>
          <Form layout="vertical" className="max-w-lg">
            <Form.Item label="允许其他用户使用全局 Key" style={{ marginBottom: 16 }}>
              <Switch checked={shareEnabled} onChange={setShareEnabled} checkedChildren="开放" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item
              label="每用户免费次数"
              extra="成功生成一篇文章计 1 次（失败不计）；配了自己的 Key 就不占额度。"
              style={{ marginBottom: 16 }}
            >
              <InputNumber
                min={1}
                max={100000}
                value={shareQuota}
                onChange={(v) => setShareQuota(v ?? 30)}
                style={{ width: 160 }}
                addonAfter="次 / 人"
              />
            </Form.Item>
            <Form.Item label="额度使用情况" style={{ marginBottom: 0 }}>
              <Table<ShareUsage>
                rowKey="username"
                size="small"
                pagination={false}
                dataSource={shareUsage}
                locale={{ emptyText: "还没有人用过共享额度" }}
                columns={[
                  { title: "用户", dataIndex: "username" },
                  {
                    title: "已用次数",
                    dataIndex: "used",
                    width: 120,
                    render: (v) => (
                      <span className="tabular-nums">
                        {v} / {shareQuota}
                      </span>
                    ),
                  },
                ]}
              />
            </Form.Item>
          </Form>
        </Card>
      )}

      {/* 子用户的免费额度提示 */}
      {isPersonal && share && share.enabled && (
        <div className="gzh-card p-4 flex gap-2.5">
          <GiftOutlined style={{ color: "#059669", marginTop: 2 }} />
          <div className="text-[13px] text-black/60 leading-relaxed">
            推广期福利：{ownKeySet
              ? `你已配置自己的 Key（额度无关了）。`
              : share.available
                ? `管理员提供了免费生成额度，不配 Key 也能用——已用 ${share.used}/${share.quota} 次。`
                : `免费额度已用完（${share.used}/${share.quota} 次），在上方配置自己的 DeepSeek API Key 后继续。`}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="primary" icon={<SaveOutlined />} onClick={save} className="gzh-btn-glow">
          保存设置
        </Button>
      </div>

      <div className="gzh-card p-4 flex gap-2.5">
        <InfoCircleOutlined style={{ color: "#4f46e5", marginTop: 2 }} />
        <div className="text-xs text-black/45 leading-relaxed space-y-1">
          <p className="m-0">· 热点检索默认走 DeepSeek 内置联网搜索（web_search）；配置了 Redfox Key 后可叠加微信公众号爆文数据选题。</p>
          <p className="m-0">· 保存后记得把每个公众号后台的 IP 白名单加上本服务器出口 IP（103.185.249.166）。</p>
          {!isPersonal && <p className="m-0">· Key 跟人走：没配 Key 的用户只有在你开放共享额度时才能生成（每人限量，可随时关闭）。</p>}
        </div>
      </div>
    </div>
  );
}
