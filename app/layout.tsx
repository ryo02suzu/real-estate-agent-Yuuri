import type { Metadata, Viewport } from "next";
import { Jost, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

// 本文は Noto Sans JP を同梱し、どの端末でも同じ見た目にする。ロゴ文字（MICHILU）は Jost
const notoSansJP = Noto_Sans_JP({ weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap", variable: "--font-noto-sans-jp" });
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
    <html lang="ja" className={`${notoSansJP.variable} ${jost.variable} h-full antialiased`}>
      <body className="flex h-dvh flex-col overflow-hidden">{children}</body>
    </html>
  );
}
