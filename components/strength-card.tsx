"use client";

// 「MICHILUの強み」のカード：この場所の道路種別の地図を、市区町村の公開図面で開く。背景は物件のまわりの航空写真（地理院タイル）、
// 右下に地図の凡例（色の見方）。ネットで公開していない市は窓口の案内。検索する前（ホーム）は絵と「住所を入れて調べる」
import type { LookupResult } from "@/lib/roadmap";
import type { ResolvedLink } from "@/lib/roadmap/municipalities";
import { AerialPhoto } from "./aerial-photo";
import { RoadMapArt } from "./city-hero";
import { COVERAGE } from "./coverage";
import { ArrowRightIcon, ExternalIcon, PinIcon } from "./icons";
import { LegendButton } from "./legend";

type Ok = Extract<LookupResult, { status: "ok" }>;

const Badge = () => <span className="self-start rounded-full bg-white/18 px-2.5 py-0.5 text-[10.5px] tracking-[0.06em]">MICHILUの強み</span>;

/** 開いたあとの操作の一言（PDF の図の市では、物件が図のどのあたりか。入口しか開けない地図は住所の貼り付け） */
function tipFor(link: ResolvedLink): React.ReactNode {
  const sheet = link.sheet;
  const page = sheet?.url.match(/#page=(\d+)/)?.[1];
  const text = sheet
    ? sheet.howto
      ? `${sheet.howto}物件は図の${sheet.where}あたりです。`
      : `物件は図の${sheet.where}あたりです${page ? `（PDFの${page}ページ目）` : ""}。`
    : (link.tip ?? (link.pinpoint ? "新しいタブで開きます。利用規約に同意すると、物件の場所が地図の中央に出ます。" : "「住所コピー」を押し、地図の住所検索に貼り付けてください。"));
  return (
    <>
      {text}
      {sheet?.neighbor && (
        <>
          {" "}
          端に近いので、隣の図
          <a href={sheet.neighbor.url} target="_blank" rel="noreferrer" className="mx-0.5 underline">
            {sheet.neighbor.label}
          </a>
          も確認してください。
        </>
      )}
    </>
  );
}

export function StrengthCard({ result, onStart }: { result?: Ok; onStart?: () => void }) {
  if (!result)
    return (
      <button onClick={onStart} className="bg-navy-gradient relative block w-full overflow-hidden rounded-2xl p-4 text-left text-white shadow-[0_10px_28px_rgba(15,47,95,0.28)] active:scale-[0.99]">
        <RoadMapArt className="absolute inset-y-0 right-0 h-full w-[60%]" />
        <span className="relative flex w-[70%] flex-col">
          <Badge />
          <span className="mt-2 text-[19px] font-bold leading-[1.4]">
            道路種別の地図を、
            <br />
            物件の場所で開く
          </span>
          <span className="mt-1.5 text-[11px] leading-[1.7] text-white/85">
            建築基準法上の道路種別を、各自治体の
            <br />
            公開図面で確認できます。
          </span>
          <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-navy">
            住所を入れて調べる
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </span>
      </button>
    );

  const m = result.municipality;
  const offline = m.coverage === "none" || m.coverage === "outside";
  const maps = offline ? [] : result.links.filter((l) => l.kind !== "public_road");
  const primary = maps[0];
  const others = result.links.filter((l) => l !== primary);
  const legend = primary?.legend;
  const card = "relative block w-full overflow-hidden rounded-2xl text-white shadow-[0_10px_28px_rgba(15,47,95,0.28)]";
  const body = (
    <>
      {/* 右：物件のまわりの航空写真（中心が物件） */}
      <div className="absolute inset-y-0 right-0 w-[64%]">
        <AerialPhoto lat={result.lat} lng={result.lng} z={17} className="h-full w-full">
          <PinIcon className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-full text-[#e8463b] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]" />
        </AerialPhoto>
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#0a2248_0%,#0a2248e6_36%,#0a224873_62%,#0a224833_100%)]" />
      <div className="relative flex min-h-[196px] flex-col justify-center p-4 pr-[40%]">
        <Badge />
        <span className="mt-2 text-[20px] font-bold leading-[1.3]">
          {offline ? (
            <>
              道路種別は
              <br />
              {m.name}の窓口で確認
            </>
          ) : (
            <>
              この場所の
              <br />
              道路種別の地図を開く
            </>
          )}
        </span>
        <span className="mt-2 text-[11px] leading-[1.7] text-white/85">
          {offline ? (
            COVERAGE[m.coverage].long
          ) : (
            <>
              建築基準法上の道路種別を、
              <br />
              {m.name}の公開図面で確認できます。
            </>
          )}
        </span>
        {primary && (
          <span className="mt-2.5 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-navy">
              <ArrowRightIcon className="h-4 w-4" />
            </span>
            <span className="truncate text-[10.5px] text-white/75">{primary.label}</span>
          </span>
        )}
      </div>
      {legend && legend.length > 0 && (
        <div className="absolute bottom-3 right-3 w-[42%] rounded-xl bg-[#0a2248]/85 px-2.5 py-2 text-[10px] leading-[1.45] text-white backdrop-blur-sm">
          <ul className="space-y-1">
            {legend.slice(0, 3).map((e) => (
              <li key={e.label} className="flex items-center gap-1.5">
                <span className="h-[5px] w-4 shrink-0 rounded-full" style={{ background: e.color }} />
                <span className="truncate">{e.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[9px] text-white/70">※凡例は自治体ごとに違います</p>
        </div>
      )}
    </>
  );
  return (
    <div>
      {primary ? (
        <a href={primary.url} target="_blank" rel="noreferrer" className={`${card} active:scale-[0.99]`}>
          {body}
        </a>
      ) : (
        <div className={card}>{body}</div>
      )}
      {primary && (
        <p className="mt-1.5 px-1 text-[11px] leading-[1.6] text-muted">
          {tipFor(primary)}
          {legend && legend.length > 0 && <LegendButton legend={legend} title={primary.label} />}
        </p>
      )}
      {others.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11px] text-muted">{offline ? "参考：公道（市道）かどうかの地図" : "ほかの地図"}</span>
          {others.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] text-ink">
              <ExternalIcon className="h-3 w-3 text-brand-light" />
              {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
