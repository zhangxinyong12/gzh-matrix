"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Dropdown } from "antd";
import {
  DashboardOutlined,
  TeamOutlined,
  FileTextOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  WechatOutlined,
} from "@ant-design/icons";

interface Me {
  user: string;
  role: string;
}

const navGroups: { title: string; items: { href: string; label: string; icon: React.ReactNode; admin?: boolean }[] }[] = [
  {
    title: "工作台",
    items: [
      { href: "/", label: "运营总览", icon: <DashboardOutlined /> },
      // 素材库不再是独立页面：素材与账号 1-1 绑定，入口在「账号管理」操作列
      { href: "/accounts", label: "账号管理", icon: <TeamOutlined /> },
    ],
  },
  {
    title: "系统",
    items: [
      { href: "/prompts", label: "提示词", icon: <FileTextOutlined />, admin: true },
      { href: "/users", label: "用户管理", icon: <UserOutlined />, admin: true },
      // 设置对所有人开放：子用户要在这里配自己的 DeepSeek Key（跟人不跟号）
      { href: "/settings", label: "系统设置", icon: <SettingOutlined /> },
    ],
  },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (pathname !== "/login") {
      fetch("/api/me").then((r) => r.json()).then(setMe);
    }
  }, [pathname]);

  // 登录页：全屏无壳（深空科技风由页面自绘）
  if (pathname === "/login") return <>{children}</>;

  const isAdmin = me?.role === "admin";
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((n) => isAdmin || !n.admin) }))
    .filter((g) => g.items.length > 0);

  const NavItem = ({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`group flex items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-sm transition-all ${
          active
            ? "bg-[#eef2ff] text-[#4f46e5] font-semibold shadow-[inset_0_0_0_1px_rgba(79,70,229,0.12)]"
            : "text-[#4b5563] hover:bg-black/[0.035] hover:text-[#111827]"
        }`}
      >
        <span className={`text-[15px] leading-none ${active ? "text-[#4f46e5]" : "text-black/40 group-hover:text-black/60"}`}>
          {icon}
        </span>
        {label}
      </Link>
    );
  };

  const mobileItems = groups.flatMap((g) => g.items);

  return (
    <div className="gzh-body min-h-screen">
      {/* ===== 侧边栏（桌面端） ===== */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-[#eef0f3] bg-white z-20">
        <Link href="/" className="flex items-center gap-3 px-5 h-[68px] border-b border-[#f2f3f5]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#8b5cf6] flex items-center justify-center text-white shadow-[0_2px_8px_rgba(79,70,229,0.35)]">
            <WechatOutlined style={{ fontSize: 17 }} />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-[15px] text-[#111827]">公众号矩阵</div>
            <div className="text-[11px] text-black/35">自动写作 · 内容工作台</div>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-5">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-black/30">{g.title}</div>
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavItem key={n.href} {...n} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 pb-4">
          {me && (
            <Dropdown
              placement="topRight"
              menu={{
                items: [
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    label: "退出登录",
                    onClick: async () => {
                      await fetch("/api/logout", { method: "POST" });
                      location.href = "/login";
                    },
                  },
                ],
              }}
            >
              <div className="flex items-center gap-2.5 rounded-[10px] border border-[#eef0f3] bg-[#fafbfc] px-3 py-2.5 cursor-pointer hover:border-[#dcdddf] hover:bg-white transition">
                <Avatar
                  size={30}
                  icon={<UserOutlined />}
                  style={{ backgroundColor: "#4f46e5", flexShrink: 0 }}
                />
                <div className="leading-tight min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#111827] truncate">{me.user}</div>
                  <div className="text-[11px] text-black/35">{me.role === "admin" ? "管理员" : "成员"}</div>
                </div>
              </div>
            </Dropdown>
          )}
          <div className="px-2 pt-3 text-[10px] text-black/25 tracking-wide">GZH-MATRIX · v1.0</div>
        </div>
      </aside>

      {/* ===== 移动端顶栏 ===== */}
      <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-[#eef0f3]">
        <div className="flex items-center gap-3 px-4 h-14">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#8b5cf6] flex items-center justify-center text-white">
            <WechatOutlined style={{ fontSize: 15 }} />
          </div>
          <span className="font-bold text-sm">公众号矩阵</span>
          {me && (
            <Dropdown
              menu={{
                items: [
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    label: "退出登录",
                    onClick: async () => {
                      await fetch("/api/logout", { method: "POST" });
                      location.href = "/login";
                    },
                  },
                ],
              }}
            >
              <Avatar size={26} icon={<UserOutlined />} style={{ backgroundColor: "#4f46e5", marginLeft: "auto" }} />
            </Dropdown>
          )}
        </div>
        <nav className="flex gap-1 px-3 pb-2 overflow-x-auto">
          {mobileItems.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[13px] ${
                  active ? "bg-[#eef2ff] text-[#4f46e5] font-semibold" : "text-black/55"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ===== 内容区 ===== */}
      <main className="lg:pl-60">
        <div className="max-w-[1700px] mx-auto px-5 lg:px-8 py-7 lg:py-9">{children}</div>
        <footer className="max-w-[1700px] mx-auto px-5 lg:px-8 pb-7 text-[11px] text-black/25 flex justify-between">
          <span>GZH-MATRIX · v1.0</span>
          <span>公众号矩阵 · 内容基础设施</span>
        </footer>
      </main>
    </div>
  );
}
