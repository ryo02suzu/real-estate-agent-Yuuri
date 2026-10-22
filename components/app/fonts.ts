// スマホの新しいホームの見出し（「調べる時間を、商談の時間に。」・「最近の検索」など）の明朝。
// ホームの部品から読むので、PC では使わない。先読みはしない（字の多い日本語は、使う字の分だけを画面が取りに行く）
import { Noto_Serif_JP } from "next/font/google";

export const serif = Noto_Serif_JP({ weight: ["700"], subsets: ["latin"], display: "swap", preload: false });
