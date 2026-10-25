import type { Metadata, Viewport } from "next";
import { Jost, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { APP_ZOOM_SCRIPT } from "@/components/app/zoom";
import { SKY_HEAD_SCRIPT } from "@/lib/app/sky-vars";

// 本文は Noto Sans JP を同梱し、どの端末でも同じ見た目にする。ロゴ文字（MICHILU）は Jost
const notoSansJP = Noto_Sans_JP({ weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap", variable: "--font-noto-sans-jp" });
const jost = Jost({ weight: ["300", "400", "500"], subsets: ["latin"], display: "swap", variable: "--font-jost" });

export const metadata: Metadata = {
  title: "MICHILU（ミチル）",
  description: "不動産のための道路情報チェック。住所から市町村の公式道路図をその場所で開きます。",
  appleWebApp: { capable: true, title: "MICHILU", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // ノッチ・ホームバーの余白は env(safe-area-inset-*) で取る
  // 時刻・電池の帯の色。スマホは新しいホームの写真の上の空の色（写真の上端をこの色からつなぐ。components/app/home.tsx の SKY）、
  // PC は今までの地の色
  themeColor: [
    { media: "(max-width: 1023px)", color: "#e6eff9" },
    { media: "(min-width: 1024px)", color: "#fbfaf8" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning：<head> のスクリプトが <html> の style に --app-zoom を書くため（React に DOM を優先させる）
    <html lang="ja" className={`${notoSansJP.variable} ${jost.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* スマホの画面の拡大率を、最初に描く前に決める（components/app/zoom.ts） */}
        <script dangerouslySetInnerHTML={{ __html: APP_ZOOM_SCRIPT }} />
        {/* 時間連動の空の色を、最初に描く前に決める（lib/app/sky-vars.ts。夜に開いても昼の空が一瞬出ない） */}
        <script dangerouslySetInnerHTML={{ __html: SKY_HEAD_SCRIPT }} />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden">{children}</body>
    </html>
  );
}
