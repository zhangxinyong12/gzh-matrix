import type { Metadata } from "next";
import Shell from "./nav";
import Providers from "./providers";
import "./globals.css";

export const metadata = { title: "公众号矩阵管理" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="gzh-body min-h-screen">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
