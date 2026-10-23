"use client";

// 「ホーム画面に追加」（アプリのように使う）の案内と、いまホーム画面のアプリで開いているかの判定
import { useSyncExternalStore } from "react";
import { Sheet } from "../sheet";

/** ホーム画面に追加したアプリとして開いているか */
export function useStandalone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia("(display-mode: standalone)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
}

const IOS: [string, string][] = [
  ["Safari の下の「共有」ボタンを押す", "四角から上に矢印が出ているボタンです"],
  ["「ホーム画面に追加」を選ぶ", "一覧を下にスクロールすると出てきます"],
  ["右上の「追加」を押す", "ホーム画面に MICHILU のアイコンが並びます"],
];
const ANDROID: [string, string][] = [
  ["Chrome の右上の「︙」を押す", "メニューが開きます"],
  ["「ホーム画面に追加」か「アプリをインストール」を選ぶ", ""],
  ["「追加」を押す", "ホーム画面に MICHILU のアイコンが並びます"],
];

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const steps = ios ? IOS : ANDROID;
  return (
    <Sheet title="ホーム画面に追加" open onClose={onClose}>
      <p className="text-[14px] leading-[1.6] text-ink">ホーム画面に追加すると、ブラウザの上下の枠が無くなり、アプリと同じ大きさ・同じ開き方で使えます。読み込みも速くなります。</p>
      <ol className="mt-4 space-y-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-bold text-white">{i + 1}</span>
            <span>
              <span className="block font-bold text-ink">{title}</span>
              {body && <span className="text-sm text-muted">{body}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11.5px] leading-[1.6] text-muted">{ios ? "iPhone の Safari での手順です。ほかのブラウザで開いているときは、いちど Safari で開いてください。" : "Android の Chrome での手順です。"}履歴・お気に入りはブラウザとは別に、追加したアプリの中に保存されます。</p>
    </Sheet>
  );
}
