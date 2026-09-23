"use client";
import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Space, App, Tag, Badge } from "antd";
import { PlusOutlined, CheckOutlined, CloseOutlined, AuditOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

interface SubUser {
  username: string;
  created_at: string;
}

interface ApplyRow {
  id: number;
  username: string;
  note: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string;
}

const APPLY_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "待审核", color: "processing" },
  approved: { label: "已通过", color: "success" },
  rejected: { label: "已拒绝", color: "default" },
};

export default function Users() {
  const { message, modal } = App.useApp();
  const [list, setList] = useState<SubUser[]>([]);
  const [apps, setApps] = useState<ApplyRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setList(await (await fetch("/api/users")).json());
    setApps(await (await fetch("/api/apply")).json());
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const values = await form.validateFields();
    const r = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const d = await r.json();
    if (!r.ok) {
      message.error(d.error || "创建失败");
      return;
    }
    message.success(`用户 ${values.username} 已创建。DeepSeek Key 由该用户登录后在「设置」页自行配置。`);
    setCreating(false);
    form.resetFields();
    load();
  };

  const review = (row: ApplyRow, action: "approve" | "reject") => {
    if (action === "reject") {
      modal.confirm({
        title: `拒绝 ${row.username} 的注册申请？`,
        content: "拒绝后该申请关闭，对方仍可重新提交。",
        okText: "拒绝",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: async () => {
          const r = await fetch("/api/apply", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: row.id, action: "reject" }),
          });
          const d = await r.json();
          if (!r.ok) return message.error(d.error || "操作失败");
          message.success("已拒绝");
          load();
        },
      });
      return;
    }
    modal.confirm({
      title: `通过 ${row.username} 的注册申请？`,
      content: "将按申请者自己填写的用户名和密码开通账号，开通后即可登录。",
      okText: "通过并开通",
      cancelText: "取消",
      onOk: async () => {
        const r = await fetch("/api/apply", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, action: "approve" }),
        });
        const d = await r.json();
        if (!r.ok) return message.error(d.error || "操作失败");
        message.success(`已开通 ${d.username}，对方可用申请时填写的密码登录`);
        load();
      },
    });
  };

  const resetPwd = (username: string) => {
    Modal.confirm({
      title: `重置 ${username} 的密码`,
      content: (
        <Input id="newpwd" placeholder="输入新密码" style={{ marginTop: 12 }} />
      ),
      onOk: () => {
        const el = document.getElementById("newpwd") as HTMLInputElement | null;
        const pwd = el?.value || "";
        if (!pwd) return Promise.reject("密码不能为空");
        return fetch("/api/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: pwd }),
        }).then(() => message.success("密码已重置"));
      },
    });
  };
  const del = (username: string) => {
    Modal.confirm({
      title: `确认删除用户 ${username}？`,
      content: "其名下账号不会被删除，但将无人可见（管理员仍可管理）。",
      onOk: async () => {
        await fetch("/api/users", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        message.success("已删除");
        load();
      },
    });
  };

  const pendingCount = apps.filter((a) => a.status === "pending").length;

  const userColumns: ColumnsType<SubUser> = [
    { title: "用户名", dataIndex: "username", render: (v) => <span className="font-medium">{v}</span> },
    { title: "创建时间", dataIndex: "created_at", render: (v) => <span className="text-black/40 tabular-nums">{v}</span> },
    {
      title: "操作",
      render: (_, u) => (
        <Space>
          <Button type="link" size="small" onClick={() => resetPwd(u.username)}>重置密码</Button>
          <Button type="link" size="small" danger onClick={() => del(u.username)}>删除</Button>
        </Space>
      ),
    },
  ];

  const applyColumns: ColumnsType<ApplyRow> = [
    { title: "用户名", dataIndex: "username", render: (v) => <span className="font-medium">{v}</span> },
    {
      title: "备注",
      dataIndex: "note",
      ellipsis: true,
      render: (v) => (v ? <span className="text-black/55">{v}</span> : <span className="text-black/25">-</span>),
    },
    {
      title: "申请时间",
      dataIndex: "created_at",
      width: 170,
      render: (v) => <span className="text-black/40 tabular-nums">{v}</span>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (v) => <Tag color={APPLY_STATUS[v]?.color}>{APPLY_STATUS[v]?.label || v}</Tag>,
    },
    {
      title: "操作",
      width: 170,
      render: (_, a) =>
        a.status === "pending" ? (
          <Space>
            <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => review(a, "approve")}>
              通过
            </Button>
            <Button size="small" icon={<CloseOutlined />} onClick={() => review(a, "reject")}>
              拒绝
            </Button>
          </Space>
        ) : (
          <span className="text-black/25 text-xs">已处理</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-bold m-0">用户管理</h1>
          <p className="text-[13px] text-black/40 mt-1 mb-0">发放登录凭证，子用户自行管理账号与 Key。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)} className="gzh-btn-glow">
          添加用户
        </Button>
      </div>

      <div className="gzh-card p-2">
        <Table<SubUser>
          rowKey="username"
          columns={userColumns}
          dataSource={list}
          pagination={false}
          locale={{ emptyText: "暂无子用户" }}
        />
      </div>

      {/* 注册申请审核 */}
      <div className="flex items-center gap-2 mt-2">
        <span className="gzh-h">
          <Badge count={pendingCount} size="small" offset={[6, 0]}>
            <span className="flex items-center gap-1.5"><AuditOutlined />注册申请</span>
          </Badge>
        </span>
      </div>
      <div className="gzh-card p-2">
        <Table<ApplyRow>
          rowKey="id"
          columns={applyColumns}
          dataSource={apps}
          pagination={false}
          locale={{ emptyText: "暂无申请——登录页的「申请注册」提交后会出现在这里" }}
        />
      </div>

      <p className="text-xs text-black/40 leading-relaxed m-0">
        子用户登录后自己添加账号（创建的账号只有自己可见），并在「设置」页配置自己的 DeepSeek Key。
      </p>

      <Modal
        open={creating}
        title="添加用户"
        onCancel={() => setCreating(false)}
        onOk={create}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password placeholder="密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
