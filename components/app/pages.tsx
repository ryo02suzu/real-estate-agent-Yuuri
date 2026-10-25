"use client";

// 住所が見つからない・候補から選ぶ・未対応の市区町村のときの画面。ホームと同じ見た目（白い角丸のカード・端末の字・iPhone の大きさの段階）。
// 検索する前のホームは components/app/home.tsx、物件の画面は components/app/mobile-app.tsx と r-*.tsx
import { ArrowLeft, ChevronRight, Map as MapIcon, MapPin, Search, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { LookupResult } from "@/lib/roadmap";
import { CARD, HEAD, LIGHT, Note, Primary, shortAddress, TEXT } from "./r-ui";
import { TileMap } from "./tile-map";
import { NAVY } from "./ui";

/** 上の欄（戻る・見出し・副題） */
function Top({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <div className="flex items-center pl-[4px] pr-[16px]" style={{ height: 56 }}>
      <button onClick={onBack} aria-label="ホームに戻る" className="press flex size-[44px] shrink-0 items-center justify-center rounded-full active:bg-[#e6ecf4]">
        <ArrowLeft size={23} strokeWidth={2} absoluteStrokeWidth color={HEAD} />
      </button>
      <div className="min-w-0 flex-1 pl-[4px]">
        <h2 className="truncate font-semibold leading-[1.25]" style={{ fontSize: 17, color: HEAD }}>
          {title}
        </h2>
        {sub && (
          <p className="mt-[2px] truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function Empty({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div className={`flex flex-col items-center px-[16px] pb-[14px] pt-[20px] text-center ${CARD}`}>
      {icon}
      <p className="mt-[10px] font-semibold leading-[1.3]" style={{ fontSize: 16, color: TEXT }}>
        {title}
      </p>
      <p className="mt-[6px] leading-[1.55]" style={{ fontSize: 13, color: LIGHT }}>
        {body}
      </p>
      {children && <div className="mt-[14px] w-full">{children}</div>}
    </div>
  );
}

const DISCLAIMER = "地図・データは参考情報です。MICHILUは判定をしません。重要事項説明などの最終確認は、必ず役所の窓口・公的な資料で行ってください。";

/** 住所が見つからない・候補が複数・未対応の市区町村 */
export function NotOkPage({ query, result, onPick, onMap, onBack, banner }: { query: string; result: Exclude<LookupResult, { status: "ok" }>; onPick: (address: string) => void; onMap: () => void; onBack: () => void; banner?: ReactNode }) {
  if (result.status === "not_found")
    return (
      <>
        <Top title="住所が見つかりませんでした" sub={`「${query}」`} onBack={onBack} />
        {banner}
        <div className="px-[16px] pt-[8px]">
          <Empty icon={<TriangleAlert size={30} strokeWidth={1.6} absoluteStrokeWidth color="#c99700" />} title="入れ方を変えると見つかることがあります" body="都道府県・市区町村から入力してください。建物名や部屋番号は外すと見つかりやすくなります。地番は「松戸市古ヶ崎四丁目3556-1」のように、町名のあとに地番を続けます。">
            <Primary onClick={onMap} icon={<MapIcon size={18} strokeWidth={1.8} absoluteStrokeWidth />}>
              地図で場所を選ぶ
            </Primary>
          </Empty>
          <Note className="mt-[10px]">{DISCLAIMER}</Note>
        </div>
      </>
    );
  if (result.status === "choose")
    return (
      <>
        <Top title="当てはまる場所が複数あります" sub="物件の場所を選んでください" onBack={onBack} />
        {banner}
        <div className="px-[16px] pt-[8px]">
          <ul className={`overflow-hidden ${CARD}`}>
            {result.candidates.slice(0, 10).map((c) => (
              <li key={c.matchedAddress} className="border-t border-[#eef2f6] first:border-t-0">
                <button onClick={() => onPick(c.matchedAddress)} className="flex min-h-[56px] w-full items-center gap-[12px] px-[12px] py-[8px] text-left active:bg-[#f5f8fc]">
                  <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 36, height: 36 }}>
                    <MapPin size={17} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />
                  </span>
                  <span className="min-w-0 flex-1 font-semibold leading-[1.3]" style={{ fontSize: 15, color: TEXT }}>
                    {c.matchedAddress}
                  </span>
                  <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
          <Note className="mt-[10px]">無ければ、都道府県から入れ直すと一度で見つかります。{DISCLAIMER}</Note>
        </div>
      </>
    );
  const city = shortAddress(result.matchedAddress).match(/^.+?[市区町村]/)?.[0] ?? "";
  return (
    <>
      <Top title={`${shortAddress(result.matchedAddress)} 付近`} sub={city ? `${city}は対応エリアの外です` : "対応エリアの外です"} onBack={onBack} />
      {banner}
      <div className="px-[16px] pt-[8px]">
        <div className={`overflow-hidden ${CARD}`}>
          <TileMap lat={result.lat} lng={result.lng} width={361} height={150} z={16}>
            {(project) => {
              const [x, y] = project([result.lng, result.lat]);
              return <span className="absolute rounded-full border-2 border-white bg-[#f0263a] shadow" style={{ left: x - 6, top: y - 6, width: 12, height: 12 }} />;
            }}
          </TileMap>
        </div>
        <div className="mt-[10px]">
          <Empty icon={<Search size={28} strokeWidth={1.6} absoluteStrokeWidth color="#9fb0c8" />} title={`${city || "この市町村"}はまだ未対応です`} body="MICHILUは関東1都6県の市区町村に対応しています。市町村の公式サイトで「指定道路図」や「道路種別」を探してください。">
            <Primary href={`https://www.google.com/search?q=${encodeURIComponent(`${city} 建築基準法 道路種別`)}`} icon={<Search size={17} strokeWidth={2} absoluteStrokeWidth />}>
              Googleで探す
            </Primary>
          </Empty>
        </div>
        <Note className="mt-[10px]">{DISCLAIMER}</Note>
      </div>
    </>
  );
}
