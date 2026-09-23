"use client";
import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { AntdRegistry } from "@ant-design/nextjs-registry";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: "#4f46e5",
            colorInfo: "#4f46e5",
            colorLink: "#4f46e5",
            borderRadius: 10,
            fontSize: 14,
            colorBgLayout: "#f6f7f9",
            colorTextBase: "#111827",
          },
          components: {
            Table: {
              headerBg: "#f8f9fb",
              headerColor: "#6b7280",
              headerSplitColor: "transparent",
              rowHoverBg: "#f8f9ff",
              borderColor: "#f0f1f4",
            },
            Card: { paddingLG: 22 },
            Button: { primaryShadow: "0 1px 2px rgba(79,70,229,0.25)" },
            Modal: { titleFontSize: 16 },
          },
        }}
      >
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
