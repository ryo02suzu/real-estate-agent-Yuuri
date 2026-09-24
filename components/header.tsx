import Image from "next/image";
import { InfoIcon } from "./icons";

// いただいたロゴをマークと文字に分け、横並びにしたもの（白地は透過）
const MARK = { src: "/logo-mark.webp", w: 204, h: 202 };
const TYPE = { src: "/logo-type.webp", w: 564, h: 164 };

export function Header({ onHelp, compact }: { onHelp: () => void; compact?: boolean }) {
  const markH = compact ? 40 : 60;
  const typeH = compact ? 29 : 42;
  return (
    <header className="flex items-center gap-2.5">
      <Image src={MARK.src} alt="" width={Math.round((markH * MARK.w) / MARK.h)} height={markH} priority />
      <Image
        src={TYPE.src}
        alt="MICHILU 不動産のための道路情報チェック"
        width={Math.round((typeH * TYPE.w) / TYPE.h)}
        height={typeH}
        priority
      />
      <button onClick={onHelp} className="ml-auto flex flex-col items-center rounded-xl px-2 py-1 text-ink hover:bg-mint">
        <InfoIcon className="h-6 w-6" />
        <span className="text-[10px]">使い方</span>
      </button>
    </header>
  );
}
