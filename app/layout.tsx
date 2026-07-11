import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { LanguageProvider } from "@/components/LanguageProvider";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QCFlow",
  description: "鞋服检品订单、记录与报告管理系统",
  icons: {
    icon: "/shuoyu-logo.jpg",
    apple: "/shuoyu-logo.jpg"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <LanguageProvider>
          <AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard>
        </LanguageProvider>
      </body>
    </html>
  );
}
