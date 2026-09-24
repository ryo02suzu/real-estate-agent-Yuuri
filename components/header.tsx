import Image from "next/image";
import { MenuIcon } from "./icons";

// ロゴのマーク（ゴールド）。文字は欧文フォントで組み、I の上にゴールドの葉を置く
const MARK = { src: "/logo-mark.webp", w: 204, h: 202 };

function Wordmark({ className }: { className: string }) {
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

export function Header({ onMenu, compact }: { onMenu: () => void; compact?: boolean }) {
  const menu = (
    <button
      onClick={onMenu}
      aria-label="メニュー"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-soft hover:bg-mint"
    >
      <MenuIcon className="h-5 w-5" />
    </button>
  );

  if (compact) {
    return (
      <header className="flex items-center gap-2.5">
        <Image src={MARK.src} alt="" width={40} height={40} priority />
        <Wordmark className="text-[26px] leading-none" />
        <span className="ml-auto">{menu}</span>
      </header>
    );
  }

  return (
    <header className="relative pt-2">
      <div className="absolute right-0 top-0">{menu}</div>
      <div className="flex items-center justify-center gap-3 pt-10">
        <Image src={MARK.src} alt="" width={Math.round((76 * MARK.w) / MARK.h)} height={76} priority />
        <Wordmark className="text-[40px] leading-none" />
      </div>
      <p className="mt-6 text-center font-serif text-[15px] leading-8 tracking-[0.12em] text-ink/85">
        住所から、建築基準法上の
        <br />
        道路種別の確認先をすぐに開けます。
      </p>
    </header>
  );
}
