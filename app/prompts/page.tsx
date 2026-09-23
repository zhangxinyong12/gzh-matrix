"use client";
import { useEffect, useState } from "react";
import { Button, Input, App } from "antd";
import { SaveOutlined, FileTextOutlined, CheckOutlined } from "@ant-design/icons";

interface Prompt {
  id: number;
  type: string;
  name: string;
  content: string;
  updated_at: string;
}

export default function Prompts() {
  const { message } = App.useApp();
  const [list, setList] = useState<Prompt[]>([]);
  const [active, setActive] = useState<Prompt | null>(null);

  const load = async () => {
    const rows: Prompt[] = await (await fetch("/api/prompts")).json();
    setList(rows);
    setActive((cur) => (cur ? rows.find((r) => r.id === cur.id) || rows[0] : rows[0]));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!active) return;
    await fetch("/api/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, content: active.content }),
    });
    message.success("提示词已保存");
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold m-0">提示词</h1>
        <p className="text-[13px] text-black/40 mt-1 mb-0">各角色的写作提示词，营销口径与禁用话术已内置。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] gap-5 items-start">
        <div className="space-y-2">
          {list.map((p) => {
            const isActive = active?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setActive(p)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm transition border ${
                  isActive
                    ? "bg-[#eef2ff] text-[#4f46e5] border-[#4f46e5]/25 font-semibold shadow-[inset_0_0_0_1px_rgba(79,70,229,0.08)]"
                    : "gzh-card text-black/60 hover:border-[#4f46e5]/30 hover:text-[#111827]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <FileTextOutlined style={{ fontSize: 12, opacity: 0.7 }} />
                  {p.name}
                </span>
                <div className={`text-[11px] mt-1 ${isActive ? "text-[#4f46e5]/60" : "text-black/30"}`}>
                  {p.updated_at}
                </div>
              </button>
            );
          })}
          <div className="gzh-card p-4 text-[11px] text-black/40 leading-relaxed">
            可用变量：<code className="text-[#4f46e5]">{"{ACCOUNT_NAME}"} {"{PERSONA}"} {"{SOURCES}"}</code>
            ，生成时自动替换。
          </div>
        </div>

        {active && (
          <div className="space-y-3">
            <Input.TextArea
              className="gzh-card font-mono !text-xs !leading-relaxed"
              style={{ height: 540, resize: "none" }}
              value={active.content}
              onChange={(e) => setActive({ ...active, content: e.target.value })}
            />
            <div className="flex items-center gap-3">
              <Button type="primary" icon={<SaveOutlined />} onClick={save} className="gzh-btn-glow">
                保存
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
