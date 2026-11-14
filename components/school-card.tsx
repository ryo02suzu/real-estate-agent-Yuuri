"use client";

// 物件の地点の小学校区・中学校区（国土数値情報の学校区。lib/roadmap/school.ts）。学校名・設置者・所在地と、学校までの距離
// （道路をたどった徒歩の目安。たどれなければ直線）。
// 令和5年度のデータで、学区は見直されることがあり、学校選択制の市区町村もあるので、指定校は教育委員会で確かめるよう添える
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import { schoolGapShort, schoolGapText, schoolLabel, schoolNotes, schoolsAt, schoolWayText, withSchoolWalks, type SchoolGapItem, type SchoolHit, type Schools } from "@/lib/roadmap/school";
import { ROAD_CREDIT } from "@/lib/roadmap/walk";
import { SCHOOL_DATA, schoolSearchUrl } from "@/lib/roadmap/school-data";
import { pmtilesSchoolSource } from "@/lib/roadmap/school-tiles";
import { Fact } from "./fact";
import { ChevronRightIcon, SchoolIcon } from "./icons";
import { Notes } from "./notes";
import { Sheet } from "./sheet";

/** none：データの無い市区町村（国のデータに入っていないか、利用条件で入れていない） */
export type SchoolState = { status: "loading" } | { status: "none" } | { status: "error" } | { status: "ok"; schools: Schools };

export function useSchools(lat: number, lng: number): SchoolState {
  const key = `${lat},${lng}`;
  const [state, setState] = useState<{ key: string; value: SchoolState }>();
  useEffect(() => {
    let alive = true;
    withRetry(() => schoolsAt(lat, lng, pmtilesSchoolSource))
      .then((s) => {
        if (!alive) return;
        if (!s || !(s.elementary || s.junior)) return setState({ key, value: { status: "none" } });
        setState({ key, value: { status: "ok", schools: s } });
        // 学校までの道のり（駅と同じ道路のタイル。読めたら直線の距離から差し替える）
        withSchoolWalks(lat, lng, s)
          .then((w) => alive && w !== s && setState({ key, value: { status: "ok", schools: w } }))
          .catch(() => {});
      })
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に地点が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : { status: "loading" };
}

function Row({ label, s, missing }: { label: string; s?: SchoolHit; missing?: string }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-[5em] shrink-0 text-[12.5px] leading-[1.7] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14.5px] leading-[1.55] text-ink">
        {s ? (
          <>
            <b className="font-semibold">{s.name}</b>
            {schoolWayText(s) && <span className="ml-1.5 text-[12.5px] text-muted">{schoolWayText(s)}</span>}
            <span className="block text-[12px] leading-[1.55] text-muted">{[s.owner, s.address].filter(Boolean).join("・")}</span>
          </>
        ) : (
          <span className="text-[13px] text-muted">{missing ?? "この地点を含む区域がデータにありません"}</span>
        )}
      </dd>
    </div>
  );
}

/**
 * 小学校区・中学校区（スマホのシート・PC のカード）。gap（スマホだけ渡す）：出せなかった学校区と市区町村の名前。
 * 無い学校区の行に短いわけを書き、下に説明と、市区町村の通学区域を探すリンクを出す
 */
export function SchoolDetail({ schools, gap }: { schools: Schools; gap?: { items: SchoolGapItem[]; city: string } }) {
  const notes = schoolNotes(schools);
  const why = (key: "es" | "jh") => {
    const g = gap?.items.find((x) => x.key === key);
    return g && `データなし（${schoolGapShort(g.why, gap!.city)}）`;
  };
  return (
    <div>
      <dl className="divide-y divide-line/70">
        <Row label="小学校区" s={schools.elementary} missing={why("es")} />
        <Row label="中学校区" s={schools.junior} missing={why("jh")} />
      </dl>
      {gap && gap.items.length > 0 && <SchoolGapNote items={gap.items} city={gap.city} />}
      {notes.map((note) => (
        <p key={note} className="mt-1 text-[12.5px] leading-[1.6] text-[#8a4f3a]">
          {note}
        </p>
      ))}
      <Notes
        lead={`${SCHOOL_DATA.edition.replace(/（.*$/, "")}のデータです。その後の学区の見直し・学校の統合は入っていません。指定校は教育委員会で確かめてください。`}
        source={
          <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer" className="underline">
            国土数値情報（国土交通省）
          </a>
        }
      >
        <p>
          {SCHOOL_DATA.edition}の市区町村の資料をもとにした通学区域です。学区は見直されることがあり、学校選択制の市区町村もあります。指定校は市区町村の教育委員会で確かめてください。徒歩は国土地理院の地図の道路をたどった、学校の位置（敷地の中の点）までの目安です（道路距離 80m を1分）。道をたどれないときは直線距離です。
        </p>
        <p>
          出典：「国土数値情報（小学校区データ・中学校区データ・学校データ）」（国土交通省）を加工して作成{(schools.elementary?.walk || schools.junior?.walk) && `。${ROAD_CREDIT}`}
        </p>
      </Notes>
    </div>
  );
}

/** 出せなかった学校区の説明と、市区町村の通学区域を探すリンク（スマホのシート。学区がまったく無い地点でも出す） */
export function SchoolGapNote({ items, city }: { items: SchoolGapItem[]; city: string }) {
  return (
    <div className="mt-2 rounded-xl border border-[#ead9b8] bg-[#fbf6ec] px-3 py-2.5 text-[13px] leading-[1.6] text-ink">
      <p>{schoolGapText(items, city)}</p>
      <a
        href={schoolSearchUrl(city)}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-flex min-h-[32px] items-center gap-1 font-semibold text-brand underline-offset-2 active:opacity-70"
      >
        {city}の通学区域を探す
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/**
 * スマホ：都市計画の行の右の小さなボタン（「学区」）。押すと小学校区・中学校区が下から出る。
 * PC は onOpen（パネルの中の学区のカードまで動かす）を渡し、学校の名前も出す。データの無い所では出さない
 */
export function SchoolButton({ state, onOpen, tile, className }: { state: SchoolState; onOpen?: () => void; tile?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  if (state.status === "none" || state.status === "error") return null;
  const s = state.status === "ok" ? state.schools : undefined;
  const names = s && [s.elementary && schoolLabel(s.elementary), s.junior && schoolLabel(s.junior)].filter(Boolean).join("・");
  return (
    <>
      {tile ? (
        <Fact
          icon={<SchoolIcon className="h-3.5 w-3.5" />}
          label="学区"
          onClick={() => setOpen(true)}
          disabled={!s}
          className={className}
          value={<span className="min-w-0 flex-1 truncate">{s ? names || "学区" : "確認中…"}</span>}
        />
      ) : (
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={state.status !== "ok"}
        className={`flex items-center gap-1 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[12px] leading-[1.5] lg:py-1.5 lg:text-[13px] text-ink disabled:text-muted lg:hover:border-brand-light/60 ${onOpen ? "min-w-0 flex-1" : "shrink-0"}`}
      >
        <SchoolIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        {onOpen ? (
          <>
            <span className="shrink-0 text-muted">学区</span>
            <span className="truncate">
              {s ? names : "確認中…"}
            </span>
          </>
        ) : (
          "学区"
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      )}
      {s && !onOpen && (
        <Sheet title="学区（参考）" open={open} onClose={() => setOpen(false)}>
          <SchoolDetail schools={s} />
        </Sheet>
      )}
    </>
  );
}

/** PC：地図の左のパネルのカード（データの無い所では出さない） */
export function SchoolCard({ state }: { state: SchoolState }) {
  if (state.status === "none") return null;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">
        <SchoolIcon className="h-4 w-4 text-brand-light" />
        学区（参考）
      </h3>
      {state.status === "loading" && <p className="text-[12px] text-muted">学区を確認しています…</p>}
      {state.status === "error" && <p className="text-[12px] text-muted">学区のデータを読み込めませんでした。時間をおいて調べ直してください。</p>}
      {state.status === "ok" && <SchoolDetail schools={state.schools} />}
    </section>
  );
}
