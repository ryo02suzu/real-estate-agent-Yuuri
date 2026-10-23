"use client";

// ホームの右上のベル（お知らせ）。サーバーを持たないので、知らせるのはアプリの更新（データの追加・画面の変更）だけで、中身はここに書く。
// 見たかどうかは端末にだけ残し、新しいお知らせがあるとベルに赤い点を付ける
import { useSyncExternalStore } from "react";
import { Sheet } from "../sheet";

/** 新しい順。先頭の id を見たかどうかで赤い点を出す */
export const NEWS: { id: string; date: string; title: string; body: string }[] = [
  {
    id: "2026-10-23-app",
    date: "2026/10/23",
    title: "物件の画面と各ページを新しくしました",
    body: "調べた結果の6つのタブは、それぞれ1画面に収まる形に。履歴・お気に入り・書類・出力・その他も作り直し、書類・出力からは書類をすぐ開けます。「その他」の「ホーム画面に追加」で、アプリと同じ大きさで使えます。",
  },
  {
    id: "2026-10-22-home",
    date: "2026/10/22",
    title: "ホーム画面を新しくしました",
    body: "住所も地番も1つの欄に入れて調べられます（地図で選ぶこともできます）。最近の検索は、用意した写真の札つきで並びます（物件の写真ではありません）。",
  },
  {
    id: "2026-10-22-triage",
    date: "2026/10/22",
    title: "「要注意点と次にやること」を足しました",
    body: "物件を調べると、問題になりそうな所と、役所・法務局で確かめることの一覧が出ます。下の「書類・出力」から開けます。",
  },
  {
    id: "2026-10-22-national",
    date: "2026/10/22",
    title: "国のデータを足しました",
    body: "液状化・大規模盛土造成地・災害の履歴・病院を、物件の地点で読みます（国土交通省の不動産情報ライブラリ・国土数値情報）。",
  },
  {
    id: "2026-10-22-deals",
    date: "2026/10/22",
    title: "取引事例を足しました",
    body: "物件の近くの取引価格・成約価格を、不動産情報ライブラリ（国土交通省）から並べます。",
  },
  {
    id: "2026-10-20-poi",
    date: "2026/10/20",
    title: "周辺施設までの徒歩の目安",
    body: "スーパー・コンビニ・ドラッグストア・病院・公園などまでの、道のりでの徒歩分数の目安を出します。",
  },
];

const KEY = "michilu:news-seen";
const EVENT = "michilu:news-seen";

/** 見たお知らせの id（端末に保存できないときは、見たことにして赤い点を出し続けない） */
function seen(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return NEWS[0].id;
  }
}

/** まだ見ていないお知らせがあるか */
export function useUnreadNews(): boolean {
  return useSyncExternalStore(
    (cb) => {
      addEventListener(EVENT, cb);
      addEventListener("storage", cb);
      return () => {
        removeEventListener(EVENT, cb);
        removeEventListener("storage", cb);
      };
    },
    () => seen() !== NEWS[0].id,
    () => false,
  );
}

export function markNewsSeen(): void {
  try {
    localStorage.setItem(KEY, NEWS[0].id);
  } catch {
    // 保存できなくても画面は続ける
  }
  dispatchEvent(new Event(EVENT));
}

export function NewsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet title="お知らせ" open={open} onClose={onClose}>
      <ul className="divide-y divide-line">
        {NEWS.map((n) => (
          <li key={n.id} className="py-3 first:pt-0">
            <p className="text-[11.5px] text-muted">{n.date}</p>
            <p className="mt-0.5 text-[14.5px] font-semibold text-ink">{n.title}</p>
            <p className="mt-1 text-[12.5px] leading-[1.6] text-ink/85">{n.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] leading-[1.6] text-muted">アプリの更新のお知らせです。物件や顧客の情報は、お知らせには使いません。</p>
    </Sheet>
  );
}
