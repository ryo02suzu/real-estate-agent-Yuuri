// スマホの新しいホームの見出し（「調べる時間を、商談の時間に。」・「最近の検索」など）の明朝。
// 先読みはしない（字の多い日本語は、使う字の分だけを画面が取りに行く）。CSS 変数で渡し、使うのはスマホの幅のときだけ
// （app/globals.css の .home-serif。最初の表示はスマホの画面で、PC は表示のあとで PC の画面に切り替わるので、PC に明朝を読ませない）
import { Noto_Serif_JP } from "next/font/google";

export const serif = Noto_Serif_JP({ weight: ["700"], subsets: ["latin"], display: "swap", preload: false, variable: "--font-serif-jp" });
