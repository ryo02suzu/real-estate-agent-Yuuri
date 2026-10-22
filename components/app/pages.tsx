"use client";

// 紺の見た目のページのうち、住所が見つからない・候補から選ぶ・未対応のときの画面（物件の画面と同じく、上の写真の部分と白いカードの中に出す）。
// 検索する前のホームは components/app/home.tsx、下のメニューのページ（履歴・お気に入り・書類・出力・その他）は components/app/tab-pages.tsx
import { ChevronRight, Info, Map as MapIcon, MapPin, Search, Share2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { LookupResult } from "@/lib/roadmap";
import { PropertyHeader } from "./property-head";
import { TileMap } from "./tile-map";
import { INK2, NAVY, SUB } from "./ui";

/** ページの見出しのアイコン（物件のピンと同じ丸） */
function HeadIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef4fb]" style={{ width: 30.9, height: 30.9 }}>
      {children}
    </span>
  );
}

export function PageHead({ icon, title, sub, right }: { icon: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start pb-[2px] pl-[9.7px] pr-[8.8px] pt-[8.4px]">
      <HeadIcon>{icon}</HeadIcon>
      <div className="ml-[8.3px] min-w-0 flex-1 pt-[5.4px]">
        <h2 className="font-bold leading-[1.3] text-[#111827]" style={{ fontSize: 10.5 }}>
          {title}
        </h2>
        {sub && (
          <p className="mt-[3.2px] leading-[1.35]" style={{ fontSize: 7.4, color: "#6b7789" }}>
            {sub}
          </p>
        )}
      </div>
      {right && <div className="ml-[6px] shrink-0 pt-[3.9px]">{right}</div>}
    </div>
  );
}

function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-[9.2px] mt-[10px] flex flex-col items-center rounded-[10px] bg-[#f7f9fd] px-[16px] py-[20px] text-center">
      {icon}
      <p className="mt-[8px] font-bold leading-none" style={{ fontSize: 9, color: INK2 }}>
        {title}
      </p>
      <p className="mt-[6px] leading-[1.6]" style={{ fontSize: 7.2, color: SUB }}>
        {body}
      </p>
      {action}
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="mx-[9.2px] mb-[6px] mt-[10px] flex gap-[4px] leading-[1.6]" style={{ fontSize: 6.4, color: "#8a95a6" }}>
      <Info size={8} strokeWidth={1.5} absoluteStrokeWidth className="mt-[1.5px] shrink-0" />
      地図・データは参考情報です。MICHILUは判定をしません。重要事項説明などの最終確認は、必ず役所の窓口・公的な資料で行ってください。
    </p>
  );
}

/** 住所が見つからない・候補が複数・未対応の市区町村 */
export function NotOkPage({ query, result, onPick, onMap }: { query: string; result: Exclude<LookupResult, { status: "ok" }>; onPick: (address: string) => void; onMap: () => void }) {
  if (result.status === "not_found")
    return (
      <>
        <PageHead icon={<Search size={13} strokeWidth={1.6} absoluteStrokeWidth color={NAVY} />} title="住所が見つかりませんでした" sub={`「${query}」`} />
        <Empty
          icon={<TriangleAlert size={22} strokeWidth={1.4} absoluteStrokeWidth color="#c99700" />}
          title="入れ方を変えると見つかることがあります"
          body="都道府県・市区町村から入力してください。建物名や部屋番号は外すと見つかりやすくなります。地番は「地番 松戸市古ヶ崎四丁目3556-1」のように入れます。"
          action={<MapButton onClick={onMap} />}
        />
        <Disclaimer />
      </>
    );
  if (result.status === "choose")
    return (
      <>
        <PageHead icon={<MapPin size={13} strokeWidth={1.6} absoluteStrokeWidth color={NAVY} />} title="当てはまる場所が複数あります" sub="物件の場所を選んでください。無ければ都道府県から入れ直すと一度で見つかります。" />
        <div className="mt-[6px]">
          {result.candidates.slice(0, 10).map((c, i, a) => (
            <button key={c.matchedAddress} onClick={() => onPick(c.matchedAddress)} className={`flex w-full items-center gap-[8px] px-[9.2px] py-[9px] text-left active:bg-[#f7f9fd] ${i < a.length - 1 ? "border-b-[0.6px] border-[#eef2f6]" : ""}`}>
              <MapPin size={11} strokeWidth={1.5} absoluteStrokeWidth color={NAVY} />
              <span className="min-w-0 flex-1 font-semibold leading-[1.3]" style={{ fontSize: 8.2, color: INK2 }}>
                {c.matchedAddress}
              </span>
              <ChevronRight size={9} strokeWidth={1.4} absoluteStrokeWidth color="#1d2b48" />
            </button>
          ))}
        </div>
        <Disclaimer />
      </>
    );
  const city = result.matchedAddress.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "").match(/^.+?[市区町村]/)?.[0] ?? "";
  return (
    <>
      <PropertyHeader title={`${result.matchedAddress} 付近`} sub={city ? `${city}は対応エリアの外です` : "対応エリアの外です"} />
      <div className="mx-[9.2px] mt-[9px] overflow-hidden rounded-[8px]">
        <TileMap lat={result.lat} lng={result.lng} width={363.5} height={150} z={16}>
          {(project) => {
            const [x, y] = project([result.lng, result.lat]);
            return <span className="absolute rounded-full border-2 border-white bg-[#f0263a] shadow" style={{ left: x - 5, top: y - 5, width: 10, height: 10 }} />;
          }}
        </TileMap>
      </div>
      <Empty
        icon={<Share2 size={20} strokeWidth={1.4} absoluteStrokeWidth color="#9fb0c8" />}
        title={`${city || "この市町村"}はまだ未対応です`}
        body="MICHILUは関東1都6県の市区町村に対応しています。市町村の公式サイトで「指定道路図」や「道路種別」を探してください。"
        action={
          <a href={`https://www.google.com/search?q=${encodeURIComponent(`${city} 建築基準法 道路種別`)}`} target="_blank" rel="noreferrer" className="mt-[10px] flex items-center gap-[5px] rounded-full px-[14px] py-[7px] font-bold leading-none text-white" style={{ fontSize: 7.6, background: NAVY }}>
            <Search size={9} strokeWidth={1.6} absoluteStrokeWidth />
            Googleで探す
          </a>
        }
      />
      <Disclaimer />
    </>
  );
}

function MapButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-[10px] flex items-center gap-[5px] rounded-full px-[14px] py-[7px] font-bold leading-none text-white" style={{ fontSize: 7.6, background: NAVY }}>
      <MapIcon size={9} strokeWidth={1.6} absoluteStrokeWidth />
      地図で場所を選ぶ
    </button>
  );
}
