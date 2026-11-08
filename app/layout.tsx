import type { Metadata, Viewport } from "next";
import { Jost, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
// PC の「調査デスク」の見た目（.desk の中だけに効く。components/desktop-shell.tsx）
import "./desk.css";
import { LAUNCH_CITY_SCRIPT } from "@/components/app/launch-city-script";
import { LAUNCH_SCRIPT } from "@/components/app/launch-script";
import { APP_ZOOM_SCRIPT } from "@/components/app/zoom";
import { SKY_HEAD_SCRIPT } from "@/lib/app/sky-vars";

// 本文は Noto Sans JP を同梱し、どの端末でも同じ見た目にする。ロゴ文字（MICHILU）は Jost
const notoSansJP = Noto_Sans_JP({ weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap", variable: "--font-noto-sans-jp" });
const jost = Jost({ weight: ["300", "400", "500"], subsets: ["latin"], display: "swap", variable: "--font-jost" });

export const metadata: Metadata = {
  title: "MICHILU（ミチル）",
  description: "不動産のための道路情報チェック。住所から市町村の公式道路図をその場所で開きます。",
  // ホーム画面に追加したアプリ（iPhone）：時刻・電池の帯の後ろまで画面を広げ、帯の字は白（帯の所は body の上の余白で、ページの上の色。
  // app/globals.css と components/app/mobile-app.tsx）。前は "default" で、帯が白いままだった
  appleWebApp: { capable: true, title: "MICHILU", statusBarStyle: "black-translucent" },
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
        {/* アプリを開いたときの演出の種類（スマホの幅だけ。最初に描く前に html の data-launch に入れる。components/app/launch-script.ts） */}
        <script dangerouslySetInnerHTML={{ __html: LAUNCH_SCRIPT }} />
        {/* 長い版の「光の道の街」（React を待たずに、最初に描くときから動く。components/app/launch-city.js） */}
        <script dangerouslySetInnerHTML={{ __html: LAUNCH_CITY_SCRIPT }} />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden">{children}</body>
    </html>
  );
}
