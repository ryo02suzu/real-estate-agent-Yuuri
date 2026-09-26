import Image from "next/image";
import { MenuIcon } from "./icons";

// ロゴのマーク（ゴールド）。文字は欧文フォントで組み、I の上にゴールドの葉を置く
const MARK = { src: "/logo-mark.webp", w: 204, h: 202 };

export function Wordmark({ className }: { className: string }) {
  return (
    <span className={`font-latin font-normal tracking-[0.12em] text-ink ${className}`} aria-label="MICHILU">
      MICH
      <span className="relative inline-block">
        I
        <svg viewBox="0 0 10 14" aria-hidden className="absolute -top-[0.32em] left-1/2 h-[0.34em] w-auto -translate-x-[15%] rotate-[18deg] text-brand-light">
          <path d="M5 0C9 3 9.5 9 5 14 .5 9 1 3 5 0Z" fill="currentColor" />
        </svg>
      </span>
      LU
    </span>
  );
}

export function Header({ onMenu, onHome, compact }: { onMenu: () => void; onHome?: () => void; compact?: boolean }) {
  const menu = (
    <button
      onClick={onMenu}
      aria-label="メニュー"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-soft hover:bg-mint"
    >
      <MenuIcon className="h-5 w-5" />
    </button>
  );

  if (compact) {
    return (
      <header className="flex items-center">
        {/* ロゴを押すとホームへ戻る */}
        <button onClick={onHome} aria-label="ホームへ戻る" className="flex items-center gap-2">
          <Image src={MARK.src} alt="" width={Math.round((42 * MARK.w) / MARK.h)} height={42} priority />
          <Wordmark className="text-[22px] leading-none" />
        </button>
        <span className="ml-auto">{menu}</span>
      </header>
    );
  }

  return (
    <header className="relative pt-2">
      <div className="absolute right-0 top-0">{menu}</div>
      <div className="flex items-center justify-center gap-2.5 pt-7 [@media(max-height:720px)]:pt-3">
        <Image src={MARK.src} alt="" width={Math.round((64 * MARK.w) / MARK.h)} height={64} priority />
        <Wordmark className="text-[32px] leading-none" />
      </div>
      <p className="mt-3 text-center text-[13px] leading-[1.8] tracking-[0.06em] text-ink/85">
        住所から、建築基準法上の
        <br />
        道路種別の確認先をすぐに開けます。
      </p>
    </header>
  );
}

/** PC の上部バー。ロゴ・（結果画面では）検索窓・メニューの文字リンク */
export function DesktopHeader({
  onHome,
  onOpen,
  children,
}: {
  onHome?: () => void;
  onOpen: (name: "help" | "cities" | "history") => void;
  children?: React.ReactNode;
}) {
  const links: ["help" | "cities" | "history", string][] = [
    ["help", "使い方"],
    ["cities", "対応エリア"],
    ["history", "検索履歴"],
  ];
  return (
    <header className="flex items-center gap-8">
      <button onClick={onHome} aria-label="ホームへ戻る" className="flex shrink-0 items-center gap-2.5">
        <Image src={MARK.src} alt="" width={Math.round((44 * MARK.w) / MARK.h)} height={44} priority />
        <Wordmark className="text-[24px] leading-none" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <nav className="flex shrink-0 items-center gap-1">
        {links.map(([key, label]) => (
          <button key={key} onClick={() => onOpen(key)} className="rounded-full px-4 py-2 text-[13px] text-ink hover:bg-mint">
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
