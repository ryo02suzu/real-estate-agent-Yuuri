import type { Metadata } from "next";
import { NationalCheck } from "@/components/check/national-check";

// 国のデータの確認用ページ（本番の画面からはつないでいない。検索にも出さない）
export const metadata: Metadata = {
  title: "国のデータの確認 | MICHILU",
  robots: { index: false, follow: false },
};

export default function CheckPage() {
  return <NationalCheck />;
}
