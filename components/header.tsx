import Image from "next/image";
import { InfoIcon } from "./icons";

export function Header({ onHelp, compact }: { onHelp: () => void; compact?: boolean }) {
  return (
    <header className="flex items-center gap-3">
      {/* ロゴ画像は白地なので、乗算で背景になじませる */}
      <Image src="/mark.png" alt="" width={compact ? 36 : 52} height={compact ? 35 : 50} priority className="mix-blend-multiply" />
      <div className="flex-1">
        <p className={`font-black tracking-wide text-ink ${compact ? "text-xl" : "text-2xl"}`}>MICHILU</p>
        {!compact && <p className="text-xs text-muted">不動産のための道路情報チェック</p>}
      </div>
      <button onClick={onHelp} className="flex flex-col items-center rounded-xl px-2 py-1 text-ink hover:bg-mint">
        <InfoIcon className="h-6 w-6" />
        <span className="text-[10px]">使い方</span>
      </button>
    </header>
  );
}
