import type { Metadata, Viewport } from "next";
import { Jost } from "next/font/google";
import "./globals.css";

// ロゴ文字（MICHILU）の欧文だけ同梱する。本文は端末の標準フォント（globals.css）
const jost = Jost({ weight: ["300", "400"], subsets: ["latin"], display: "swap", variable: "--font-jost" });

export const metadata: Metadata = {
  title: "MICHILU（ミチル）",
  description: "不動産のための道路情報チェック。住所から市町村の公式道路図をその場所で開きます。",
  appleWebApp: { capable: true, title: "MICHILU", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // ノッチ・ホームバーの余白は env(safe-area-inset-*) で取る
  themeColor: "#fbfaf8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${jost.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
