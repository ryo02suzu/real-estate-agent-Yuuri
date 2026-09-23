import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

// 端末ごとに字形がばらつかないよう、日本語フォントを同梱する
const notoSansJP = Noto_Sans_JP({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
});

export const metadata: Metadata = {
  title: "MICHILU（ミチル）",
  description: "不動産のための道路情報チェック。住所から市町村の公式道路図をその場所で開きます。",
  appleWebApp: { capable: true, title: "MICHILU", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fefeff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
