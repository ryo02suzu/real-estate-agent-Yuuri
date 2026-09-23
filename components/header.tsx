import Image from "next/image";
import { InfoIcon } from "./icons";

// ロゴはいただいた画像をそのまま使う（余白を詰め、白地を透過にしたもの, 640x544）
const LOGO_RATIO = 544 / 640;

export function Header({ onHelp, compact }: { onHelp: () => void; compact?: boolean }) {
  const width = compact ? 84 : 200;
  return (
    <header className={`relative flex items-center ${compact ? "justify-start" : "justify-center pt-2"}`}>
      <Image
        src="/logo.webp"
        alt="MICHILU 不動産のための道路情報チェック"
        width={width}
        height={Math.round(width * LOGO_RATIO)}
        priority
      />
      <button onClick={onHelp} className="absolute right-0 top-0 flex flex-col items-center rounded-xl px-2 py-1 text-ink hover:bg-mint">
        <InfoIcon className="h-6 w-6" />
        <span className="text-[10px]">使い方</span>
      </button>
    </header>
  );
}
