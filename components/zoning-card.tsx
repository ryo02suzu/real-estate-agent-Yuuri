"use client";

// 物件の地点の都市計画（用途地域・建ぺい率・容積率・防火・高度地区など）。国土交通省の都市計画決定GISデータを
// アプリと同じサイトに置いたタイルから読む（lib/roadmap/zoning.ts）。道路種別の結果を先に出し、こちらは後から読み込む。
// 重説の「その他の法令」の下調べ（盛土規制法の区域・砂防指定地や急傾斜地崩壊危険区域などの区域・自然公園と農業振興地域・
// 埋蔵文化財の遺跡地図。lib/roadmap/morido.ts・hourei.ts・tochi.ts・iseki.ts）と、上下水道の台帳の地図（suido.ts）も添える。
// スマホのシートは「都市計画」「その他の法令」「上下水道」のタブに分け（それぞれ1画面に収める）、PC のカードは続けて出す
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import type { Municipality } from "@/lib/roadmap";
import { HOUREI_SHORT, houreiAt, houreiCautionAll, houreiChips, houreiGroups, houreiNotesLine, PREF_NAMES, type Hourei } from "@/lib/roadmap/hourei";
import { pmtilesHoureiSource } from "@/lib/roadmap/hourei-tiles";
import { isekiFor, isekiNote, type Iseki } from "@/lib/roadmap/iseki";
import { MORIDO_DATA, moridoAt, moridoDetail, moridoNote, moridoNotice, moridoValue, type Morido } from "@/lib/roadmap/morido";
import { pmtilesMoridoSource } from "@/lib/roadmap/morido-tiles";
import { suidoFor, type SuidoLink } from "@/lib/roadmap/suido";
import { TOCHI_YEAR, tochiAt, tochiCheck, tochiLine, type Tochi } from "@/lib/roadmap/tochi";
import { pmtilesTochiSource } from "@/lib/roadmap/tochi-tiles";
import { statusFor, zoningAt, zoningChips, zoningRows, type Zoning, type ZoningStatus } from "@/lib/roadmap/zoning";
import { ZONING_DATA } from "@/lib/roadmap/zoning-data";
import { pmtilesZoningSource } from "@/lib/roadmap/zoning-tiles";
import { AlertIcon, ChevronRightIcon, InfoIcon, ZoningIcon } from "./icons";
import { Sheet } from "./sheet";

/**
 * morido：盛土規制法の区域、hourei：砂防指定地・急傾斜地崩壊危険区域などの区域、tochi：自然公園・農業振興地域（読めなければ無し）、
 * iseki：埋蔵文化財の確認先、suido：上下水道の台帳の地図
 */
export type ZoningState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; zoning: Zoning; st?: ZoningStatus; morido?: Morido; hourei?: Hourei; tochi?: Tochi; iseki?: Iseki; suido?: SuidoLink[] };

/** 地点の都市計画を読む（市区町村のデータの有無と時点も） */
export function useZoning(lat: number, lng: number, municipality: Municipality): ZoningState {
  const codes = municipality.codes.join(",");
  const key = `${lat},${lng},${codes}`;
  const [state, setState] = useState<{ key: string; value: ZoningState }>();
  useEffect(() => {
    let alive = true;
    Promise.all([
      withRetry(() => zoningAt(lat, lng, pmtilesZoningSource)),
      import("@/lib/roadmap/data/zoning-status.json"),
      // 盛土規制法・砂防指定地などの区域は読めなくても都市計画は出す
      withRetry(() => moridoAt(lat, lng, codes.split(",")[0], pmtilesMoridoSource)).catch(() => null),
      withRetry(() => houreiAt(lat, lng, codes.split(",")[0], pmtilesHoureiSource)).catch(() => null),
      withRetry(() => tochiAt(lat, lng, codes.split(",")[0], pmtilesTochiSource)).catch(() => null),
    ])
      .then(([zoning, mod, morido, hourei, tochi]) => {
        if (!alive) return;
        const st = statusFor(codes.split(","), mod.default as Record<string, ZoningStatus>);
        const iseki = isekiFor(municipality, lat, lng);
        const suido = suidoFor(municipality, lat, lng);
        setState({
          key,
          value: zoning ? { status: "ok", zoning, st, morido: morido ?? undefined, hourei: hourei ?? undefined, tochi: tochi ?? undefined, iseki, suido } : { status: "error" },
        });
      })
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に lat・lng・codes が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : { status: "loading" };
}

/** 注意の色にする印 */
const WARN_CHIP = new RegExp(`計画道路|境目|調整|自然公園|農用地|${Object.values(HOUREI_SHORT).join("|")}`);

/** 自然公園の特別地域・特別保護地区と、農用地区域の印（普通地域・農用地区域の外の農業振興地域は印にしない） */
function tochiChips(t?: Tochi): string[] {
  return [t?.park && t.park !== "普通地域" && "自然公園", t?.agri === "農用地区域" && "農用地区域"].filter((c): c is string => !!c);
}

/**
 * 用途地域などを1行に並べる。スマホは押すと詳しい一覧を下から出す。
 * PC は onOpen（パネルの中の都市計画のカードまで動かす）を渡す
 */
export function ZoningLine({ state, city, onOpen }: { state: ZoningState; city: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  // 砂防指定地・急傾斜地などの区域に入っていれば、用途地域の次に注意の印を出す
  const chips = state.status === "ok" ? zoningChips(state.zoning).flatMap((c, i) => (i === 0 ? [c, ...houreiChips(state.hourei), ...tochiChips(state.tochi)] : [c])) : [];
  return (
    <>
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={state.status !== "ok"}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[11px] leading-[1.5] text-ink lg:hover:border-brand-light/60"
      >
        <ZoningIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        <span className={`shrink-0 text-muted ${state.status === "ok" && !onOpen ? "short:hidden" : ""}`}>都市計画</span>
        {state.status === "loading" && <span className="truncate text-muted">確認中…</span>}
        {state.status === "error" && <span className="truncate text-muted">データを読み込めませんでした</span>}
        {state.status === "ok" && (
          // 1行に収まる分だけ出す（入らない印は折り返して隠れる。全部は押して開く一覧で見る）
          <span className="flex h-[18px] min-w-0 flex-1 flex-wrap items-center gap-x-1 overflow-hidden">
            {chips.map((c, i) => (
              <span
                key={c}
                className={`shrink-0 whitespace-nowrap rounded px-1 ${i === 0 ? "bg-mint font-semibold text-brand" : WARN_CHIP.test(c) ? "bg-[#f8ece6] text-[#8a4f3a]" : "bg-[#f3f1ed] text-ink"}`}
              >
                {c}
              </span>
            ))}
          </span>
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {state.status === "ok" && !onOpen && (
        <Sheet title="法令に基づく制限（参考）" open={open} onClose={() => setOpen(false)}>
          <ZoningDetail state={state} city={city} tabs />
        </Sheet>
      )}
    </>
  );
}

/** PC：地図の左のパネルのカード */
export function ZoningCard({ state, city }: { state: ZoningState; city: string }) {
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <ZoningIcon className="h-4 w-4 text-brand-light" />
        法令に基づく制限（参考）
      </h3>
      {state.status === "loading" && <p className="text-[12px] text-muted">都市計画を確認しています…</p>}
      {state.status === "error" && <p className="text-[12px] text-muted">都市計画のデータを読み込めませんでした。時間をおいて調べ直してください。</p>}
      {state.status === "ok" && <ZoningDetail state={state} city={city} />}
    </section>
  );
}

// 一覧の行の形。シートで画面に入りきらなければ詰める（dense・denser・densest は components/sheet.tsx の useDense）
const ROW = "flex gap-3 py-1.5 dense:py-1 denser:py-[3px] densest:py-[2px]";
const LABEL = "w-[8.6em] shrink-0 text-[11.5px] leading-[1.6] text-muted denser:text-[11px]";
const VALUE = "text-[13px] font-semibold leading-[1.5] denser:text-[12.5px] denser:leading-[1.4] densest:leading-[1.3]";
const SUB = "mt-0.5 block text-[10.5px] leading-[1.55] text-muted dense:mt-0 dense:leading-[1.45] denser:text-[10px] densest:leading-[1.35]";
const NOTE = "mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted dense:mt-1.5 dense:leading-[1.5] denser:text-[10px] densest:mt-1 densest:leading-[1.4]";
const TABS = ["都市計画", "その他の法令", "上下水道"];

/** 都市計画と、その他の法令の下調べ。tabs：スマホのシート（タブで分ける） */
function ZoningDetail({ state, city, tabs }: { state: Extract<ZoningState, { status: "ok" }>; city: string; tabs?: boolean }) {
  const [tab, setTab] = useState(0);
  const warn = !!state.hourei?.hits.length || tochiChips(state.tochi).length > 0;
  if (!tabs)
    return (
      <div>
        <ZoningPart state={state} city={city} />
        <h4 className="mb-0.5 mt-3 border-t border-line/70 pt-2.5 text-[12px] font-semibold text-ink">その他の法令（重説の下調べ）</h4>
        <OtherPart state={state} city={city} />
        <h4 className="mb-0.5 mt-3 border-t border-line/70 pt-2.5 text-[12px] font-semibold text-ink">上下水道</h4>
        <dl>
          <SuidoRow links={state.suido ?? []} city={city} />
        </dl>
      </div>
    );
  return (
    <div>
      <div role="tablist" className="mb-1.5 flex gap-1 densest:mb-1">
        {TABS.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={i === tab}
            onClick={() => setTab(i)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] densest:py-0.5 ${i === tab ? "border-brand bg-brand text-white" : "border-line text-ink"}`}
          >
            {t}
            {i === 1 && warn && <AlertIcon className={`h-3 w-3 ${i === tab ? "text-white" : "text-[#8a4f3a]"}`} aria-label="区域内" />}
          </button>
        ))}
      </div>
      {tab === 0 && <ZoningPart state={state} city={city} />}
      {tab === 1 && <OtherPart state={state} city={city} />}
      {tab === 2 && (
        <dl>
          <SuidoRow links={state.suido ?? []} city={city} />
        </dl>
      )}
    </div>
  );
}

/** 都市計画の一覧と、データの時点・出典 */
function ZoningPart({ state: { zoning, st }, city }: { state: Extract<ZoningState, { status: "ok" }>; city: string }) {
  const rows = zoningRows(zoning, st);
  return (
    <div>
      <dl className="divide-y divide-line/70">
        {rows.map((r) => (
          <div key={r.label + r.value} className={ROW}>
            <dt className={LABEL}>{r.label}</dt>
            <dd className="min-w-0 flex-1">
              <span className={`flex items-start gap-1.5 ${VALUE} ${r.warn ? "text-[#8a4f3a]" : "text-ink"}`}>
                {r.color && <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10 denser:mt-[4px]" style={{ background: r.color }} />}
                {r.warn && !r.color && <AlertIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 denser:mt-[2px]" />}
                <span>{r.value}</span>
              </span>
              {r.sub && <span className={SUB}>{r.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className={NOTE}>
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          {st ? `${st.city}のデータは${st.asOf ? `${st.asOf}時点` : "時点の記載なし"}。` : `${city}は国のデータに載っていません。`}
          {st?.note && `${st.note.replace(/。?$/, "。")}`}
          地図上の区域は概ねの位置で、実際の範囲や最新の決定と異なることがあります。重要事項説明などの最終確認は、{city}の都市計画の窓口・都市計画図で行ってください。
          <span className="mt-1 block dense:mt-0.5">
            出典：
            <a href="https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html" target="_blank" rel="noreferrer" className="underline">
              都市計画決定GISデータ（国土交通省）
            </a>
            を加工して作成（{ZONING_DATA.edition}）
          </span>
        </span>
      </p>
    </div>
  );
}

/** その他の法令の下調べ：盛土規制法・砂防指定地や急傾斜地などの区域・自然公園と農業振興地域・埋蔵文化財と、その出典・特記事項 */
function OtherPart({ state: { morido, hourei, tochi, iseki }, city }: { state: Extract<ZoningState, { status: "ok" }>; city: string }) {
  const notes = hourei && houreiNotesLine(hourei.pref);
  return (
    <div>
      <dl className="divide-y divide-line/70">
        {morido && <MoridoRow morido={morido} />}
        {hourei && <HoureiRow hourei={hourei} />}
        {tochi && <TochiRow tochi={tochi} city={city} />}
        {iseki && <IsekiRow iseki={iseki} />}
      </dl>
      <p className={NOTE}>
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          国のデータの区域は概略の位置で、法的図書ではありません。重要事項説明には、区域を指定した都県・市の資料で確かめてください。
          {(morido || hourei || tochi) && (
            <span className="mt-1 block dense:mt-0.5">
              {/* 国土数値情報のデータは1つの文にまとめる（「国土数値情報（○○データ、△△データ）」） */}
              出典：
              <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer" className="underline">
                国土数値情報
              </a>
              （
              {[
                morido && `宅地造成等工事規制区域・特定盛土等規制区域データ（${MORIDO_DATA.asOf}時点）`,
                hourei && "砂防指定地・地すべり防止区域・急傾斜地崩壊危険区域・災害危険区域データ",
                tochi && `自然公園地域・農業地域データ（${TOCHI_YEAR}年度）`,
              ]
                .filter(Boolean)
                .join("、")}
              ）（国土交通省）を加工して作成
            </span>
          )}
          {/* 都県が利用条件で求める特記事項（東京都は急傾斜地と地すべりで文が違うので、どちらの文かを添える） */}
          {notes && <span className="mt-0.5 block">{notes}</span>}
        </span>
      </p>
    </div>
  );
}

/** 盛土規制法の区域の行（国のデータ・参考）。区域を指定した都県・市と、その地図・資料へのリンク */
function MoridoRow({ morido }: { morido: Morido }) {
  const a = morido.area;
  return (
    <div className={ROW}>
      <dt className={LABEL}>盛土規制法</dt>
      <dd className="min-w-0 flex-1">
        <span className={`block ${VALUE} text-ink`}>
          {moridoValue(morido)}
          {morido.link && (
            <a href={morido.link.url} target="_blank" rel="noreferrer" className="ml-2 whitespace-nowrap text-[11px] text-brand underline">
              {/^https:\/\/www2\.wagmap/.test(morido.link.url) ? "地図で見る" : "区域の資料"}
            </a>
          )}
        </span>
        <span className={SUB}>
          {a ? (a.notice ? moridoNotice(morido) : moridoDetail(morido)) : `区域の指定は${morido.authority}`}
          <br />
          {moridoNote(morido.authority)}
        </span>
      </dd>
    </div>
  );
}

/** 砂防指定地・地すべり防止区域・急傾斜地崩壊危険区域・災害危険区域の行（国のデータ・参考）。入っていれば区域ごとの名前・告示と確かめる先 */
function HoureiRow({ hourei }: { hourei: Hourei }) {
  const groups = houreiGroups(hourei.hits);
  const pref = PREF_NAMES[hourei.pref];
  return (
    <div className={ROW}>
      <dt className={LABEL}>土砂災害等の区域</dt>
      <dd className="min-w-0 flex-1">
        {groups.length > 0 ? (
          <>
            <span className={`flex items-start gap-1.5 ${VALUE} text-[#8a4f3a]`}>
              <AlertIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 denser:mt-[2px]" />
              <span>{groups.map((g) => g.kind).join("・")}（国のデータ）</span>
            </span>
            <span className={SUB}>
              {groups.map((g) => (
                <span key={g.kind} className="block">
                  {HOUREI_SHORT[g.kind]}：{g.text}
                </span>
              ))}
              {houreiCautionAll(hourei)}
            </span>
          </>
        ) : (
          <>
            <span className={`block ${VALUE} text-ink`}>区域外（国のデータ）</span>
            <span className={SUB}>
              砂防指定地・地すべり防止区域・急傾斜地崩壊危険区域・災害危険区域
              {hourei.missing.length > 0 && `（${pref}の${hourei.missing.join("・")}は国のデータに無い）`}
            </span>
          </>
        )}
      </dd>
    </div>
  );
}

/** 自然公園（自然公園法）と農業振興地域（農振法）の行（国のデータ・参考）。2015年度の土地利用基本計画図の概略の区域 */
function TochiRow({ tochi, city }: { tochi: Tochi; city: string }) {
  const check = tochiCheck(tochi, city);
  return (
    <div className={ROW}>
      <dt className={LABEL}>自然公園・農振</dt>
      <dd className="min-w-0 flex-1">
        {check ? (
          <>
            <span className={`flex items-start gap-1.5 ${VALUE} text-[#8a4f3a]`}>
              <AlertIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 denser:mt-[2px]" />
              <span>{tochiLine(tochi)}（国のデータ）</span>
            </span>
            <span className={SUB}>
              {tochi.year}年度・縮尺約1/5万の概略。{check}
            </span>
          </>
        ) : (
          <>
            <span className={`block ${VALUE} text-ink`}>区域外（国のデータ）</span>
            <span className={SUB}>自然公園・農業振興地域（{tochi.year}年度の国のデータ）</span>
          </>
        )}
      </dd>
    </div>
  );
}

/** 埋蔵文化財の行。包蔵地（遺跡）に入るかは教育委員会で確かめるもので、ここでは都県・市の遺跡地図と窓口を出す */
function IsekiRow({ iseki }: { iseki: Iseki }) {
  const m = iseki.map;
  return (
    <div className={ROW}>
      <dt className={LABEL}>埋蔵文化財</dt>
      <dd className="min-w-0 flex-1">
        <span className={`block ${VALUE} text-ink`}>
          {m ? "遺跡地図で確認" : `${iseki.city}の教育委員会で確認`}
          {m && (
            <a href={m.url} target="_blank" rel="noreferrer" title={m.name} className="ml-2 whitespace-nowrap text-[11px] text-brand underline">
              {m.at ? "地図で見る" : "開く"}
            </a>
          )}
        </span>
        {(m || iseki.note) && <span className={SUB}>{isekiNote(iseki)}</span>}
      </dd>
    </div>
  );
}

/** 上下水道の行。台帳の地図を公開している市町村は、その地図を物件の場所で開く */
function SuidoRow({ links, city }: { links: SuidoLink[]; city: string }) {
  return (
    <div className={ROW}>
      <dt className={LABEL}>上下水道</dt>
      <dd className="min-w-0 flex-1">
        <span className={`block ${VALUE} text-ink`}>
          {links.length ? "台帳の地図で確認" : `${city}の上下水道の担当で確認`}
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" title={l.name} className="ml-2 whitespace-nowrap text-[11px] text-brand underline">
              {l.kind === "下水道" ? "下水道" : "水道"}
            </a>
          ))}
        </span>
        <span className={SUB}>前面道路の本管・口径・引込みの有無は、水道事業者・下水道の担当で確認</span>
      </dd>
    </div>
  );
}
