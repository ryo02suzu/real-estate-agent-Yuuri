"use client";

// 物件の地点の小学校区・中学校区（国土数値情報の学校区。lib/roadmap/school.ts）。学校名・設置者・所在地と、学校までの距離
// （道路をたどった徒歩の目安。たどれなければ直線）。
// 令和5年度のデータで、学区は見直されることがあり、学校選択制の市区町村もあるので、指定校は教育委員会で確かめるよう添える
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import { schoolShort, schoolsAt, schoolWayText, withSchoolWalks, type SchoolHit, type Schools } from "@/lib/roadmap/school";
import { ROAD_CREDIT } from "@/lib/roadmap/walk";
import { SCHOOL_DATA } from "@/lib/roadmap/school-data";
import { pmtilesSchoolSource } from "@/lib/roadmap/school-tiles";
import { ChevronRightIcon, InfoIcon, SchoolIcon } from "./icons";
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

function Row({ label, s }: { label: string; s?: SchoolHit }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-[5.5em] shrink-0 text-[11.5px] leading-[1.6] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13px] leading-[1.5] text-ink">
        {s ? (
          <>
            <b className="font-semibold">{s.name}</b>
            {schoolWayText(s) && <span className="ml-1.5 text-[11.5px] text-muted">{schoolWayText(s)}</span>}
            <span className="block text-[11px] leading-[1.5] text-muted">{[s.owner, s.address].filter(Boolean).join("・")}</span>
          </>
        ) : (
          <span className="text-[12px] text-muted">この地点を含む区域がデータにありません</span>
        )}
      </dd>
    </div>
  );
}

/** 小学校区・中学校区（スマホのシート・PC のカード） */
export function SchoolDetail({ schools }: { schools: Schools }) {
  const note = schools.elementary?.note ?? schools.junior?.note;
  return (
    <div>
      <dl className="divide-y divide-line/70">
        <Row label="小学校区" s={schools.elementary} />
        <Row label="中学校区" s={schools.junior} />
      </dl>
      {note && <p className="mt-1 text-[11.5px] leading-[1.6] text-[#8a4f3a]">{note}</p>}
      <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted">
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          {SCHOOL_DATA.edition}の市区町村の資料をもとにした通学区域です。学区は見直されることがあり、学校選択制の市区町村もあります。指定校は市区町村の教育委員会で確かめてください。徒歩は国土地理院の地図の道路をたどった、学校の位置（敷地の中の点）までの目安です（道路距離 80m を1分）。道をたどれないときは直線距離です。
          <span className="mt-1 block">
            出典：
            <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer" className="underline">
              「国土数値情報（小学校区データ・中学校区データ・学校データ）」（国土交通省）
            </a>
            を加工して作成{(schools.elementary?.walk || schools.junior?.walk) && `。${ROAD_CREDIT}`}
          </span>
        </span>
      </p>
    </div>
  );
}

/**
 * スマホ：都市計画の行の右の小さなボタン（「学区」）。押すと小学校区・中学校区が下から出る。
 * PC は onOpen（パネルの中の学区のカードまで動かす）を渡し、学校の名前も出す。データの無い所では出さない
 */
export function SchoolButton({ state, onOpen }: { state: SchoolState; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  if (state.status === "none" || state.status === "error") return null;
  const s = state.status === "ok" ? state.schools : undefined;
  return (
    <>
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={state.status !== "ok"}
        className={`flex items-center gap-1 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[11px] leading-[1.5] text-ink disabled:text-muted lg:hover:border-brand-light/60 ${onOpen ? "min-w-0 flex-1" : "shrink-0"}`}
      >
        <SchoolIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        {onOpen ? (
          <>
            <span className="shrink-0 text-muted">学区</span>
            <span className="truncate">
              {s ? [s.elementary && schoolShort(s.elementary.name), s.junior && schoolShort(s.junior.name)].filter(Boolean).join("・") : "確認中…"}
            </span>
          </>
        ) : (
          "学区"
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
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
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <SchoolIcon className="h-4 w-4 text-brand-light" />
        学区（参考）
      </h3>
      {state.status === "loading" && <p className="text-[12px] text-muted">学区を確認しています…</p>}
      {state.status === "error" && <p className="text-[12px] text-muted">学区のデータを読み込めませんでした。時間をおいて調べ直してください。</p>}
      {state.status === "ok" && <SchoolDetail schools={state.schools} />}
    </section>
  );
}
