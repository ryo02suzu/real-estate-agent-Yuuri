"use client";

// PC の「調査デスク」で真ん中に重ねて開く画面のうち、物件に関係なく開けるもの：お気に入り・履歴・並べて比較・使い方・対応エリア・設定。
// どれも端末の中だけのデータ（localStorage）で、住所をサーバーに送らない
import { ExternalLink, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { compareTable, type CompareItem } from "@/lib/app/compare";
import { googleFailText, TOD_LABEL, TODS, type DeskPrefs, type GoogleFail } from "@/lib/app/desk";
import { groupByProperty, markOf, matches, sections, stamp } from "@/lib/app/history-view";
import { placeParts, placeTitle } from "@/lib/app/scene";
import { favoriteKey, type FavoriteItem } from "@/lib/favorites";
import { historyKey, type HistoryItem } from "@/lib/history";
import { MUNICIPALITIES, type Municipality } from "@/lib/roadmap";
import { AREA_LABEL, REGIONS, REGION_ORDER } from "@/lib/roadmap/regions";
import { CoverageBadge } from "../coverage";
import { SenderFields } from "../app/sender-editor";
import { Overlay } from "./ui";

/** 絞り込みに合う所に印を付けて出す */
function Marked({ text, q }: { text: string; q: string }) {
  const m = markOf(text, q);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[0]}
      <mark className="rounded bg-[var(--gold-soft)] px-0.5 text-inherit">{m[1]}</mark>
      {m[2]}
    </>
  );
}

function Filter({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="desk-filter">
      <Search size={16} aria-hidden className="shrink-0 text-[var(--muted)]" />
      <span className="sr-only">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="町名・地番で絞り込む" />
    </label>
  );
}

/** 一覧の行・左の列の札の名前（地番で調べたものは地番と町名、住所で調べたものは町名と市区町村まで。番地は出さない） */
export function placeLabel(h: HistoryItem): { big: string; place: string } {
  const p = placeParts(h);
  const tail = p.full.replace(p.city, "").trim();
  const chiban = tail.match(/(\d+(?:-\d+)*)\s*$/)?.[1];
  if (p.chiban && chiban) return { big: chiban, place: [p.city, p.town].filter(Boolean).join(" ") || h.address };
  if (p.town) return { big: p.town, place: p.city };
  return { big: placeTitle(h).title || h.address, place: "" };
}

export function FavoritesOverlay({ items, onOpen, onRemove, onClose }: { items: FavoriteItem[]; onOpen: (f: FavoriteItem) => void; onRemove: (f: FavoriteItem) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "town">("new");
  // 開いたときの時刻（描くたびに時計を読まない）
  const [now] = useState(() => Date.now());
  const list = useMemo(() => {
    const l = items.filter((f) => matches(f, q));
    return sort === "town" ? [...l].sort((a, b) => placeTitle(a).title.localeCompare(placeTitle(b).title, "ja", { numeric: true })) : l;
  }, [items, q, sort]);
  return (
    <Overlay title="お気に入り" hint="星を付けた土地。この端末だけに保存されます" onClose={onClose}>
      <div className="desk-toolbar">
        <Filter value={q} onChange={setQ} label="お気に入りを絞り込む" />
        <div className="seg" role="group" aria-label="並べ替え">
          <button type="button" aria-pressed={sort === "new"} onClick={() => setSort("new")}>
            保存した順
          </button>
          <button type="button" aria-pressed={sort === "town"} onClick={() => setSort("town")}>
            町名順
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="desk-empty">
          <b>保存した土地はまだありません</b>
          調べた物件のカルテの ☆ で保存できます。保存した物件はこの端末の中だけに残ります。
        </p>
      ) : list.length === 0 ? (
        <p className="desk-empty">
          <b>合う土地がありません</b>
          絞り込みの文字を変えてください。
        </p>
      ) : (
        <ul className="desk-list" aria-label="お気に入りの一覧">
          {list.map((f) => {
            const t = placeLabel(f);
            return (
              <li key={favoriteKey(f)} className="desk-row">
                <span className="big">
                  <Marked text={t.big} q={q} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    <Marked text={t.place} q={q} />
                  </span>
                  <span className="meta">
                    <span>{f.ll ? "地図で選んだ地点" : f.address}</span>
                    <span>{stamp(f.at, now, true)}</span>
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <button type="button" className="btn primary small" onClick={() => onOpen(f)} aria-label={`${t.place} ${t.big} を開く`}>
                    開く
                  </button>
                  <button type="button" className="btn small" onClick={() => onRemove(f)} aria-label={`${t.place} ${t.big} をお気に入りから外す`}>
                    外す
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Overlay>
  );
}

export function HistoryOverlay({ items, onOpen, onRemove, onClear, onClose }: { items: HistoryItem[]; onOpen: (h: HistoryItem) => void; onRemove: (items: HistoryItem[]) => void; onClear: () => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [byCity, setByCity] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // 開いたときの時刻（描くたびに時計を読まない）
  const [now] = useState(() => Date.now());
  const secs = useMemo(() => sections(groupByProperty(items.filter((h) => matches(h, q))), byCity, now), [items, q, byCity, now]);
  return (
    <Overlay
      title="履歴"
      hint="調べた土地。同じ土地はまとめます。この端末だけに保存されます"
      onClose={onClose}
      actions={
        items.length > 0 &&
        (confirm ? (
          <span className="flex items-center gap-1.5">
            <span className="hint">全部消しますか？</span>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                onClear();
                setConfirm(false);
              }}
            >
              消す
            </button>
            <button type="button" className="btn ghost small" onClick={() => setConfirm(false)}>
              やめる
            </button>
          </span>
        ) : (
          <button type="button" className="btn small" onClick={() => setConfirm(true)}>
            <Trash2 size={14} aria-hidden />
            全部消す
          </button>
        ))
      }
    >
      <div className="desk-toolbar">
        <Filter value={q} onChange={setQ} label="履歴を絞り込む" />
        <div className="seg" role="group" aria-label="まとめ方">
          <button type="button" aria-pressed={!byCity} onClick={() => setByCity(false)}>
            日付ごと
          </button>
          <button type="button" aria-pressed={byCity} onClick={() => setByCity(true)}>
            市区町村ごと
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="desk-empty">
          <b>まだ履歴はありません</b>
          住所・地番で調べると、ここに残ります。
        </p>
      ) : secs.length === 0 ? (
        <p className="desk-empty">
          <b>合う土地がありません</b>
          絞り込みの文字を変えてください。
        </p>
      ) : (
        secs.map((s) => (
          <section key={s.label} aria-label={s.label}>
            <h3 className="desk-datehead">{s.label}</h3>
            <ul className="desk-list">
              {s.rows.map((g) => {
                const h = g.item;
                const t = placeLabel(h);
                return (
                  <li key={historyKey(h)} className="desk-row">
                    <span className="big">
                      <Marked text={t.big} q={q} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        <Marked text={t.place} q={q} />
                      </span>
                      <span className="meta">
                        <span>{stamp(h.at, now, byCity)}</span>
                        {h.ll && <span>地図で選んだ地点</span>}
                        {g.members.length > 1 && <span>{g.members.length}回調べた</span>}
                        {h.coverage && <CoverageBadge coverage={h.coverage} />}
                      </span>
                    </span>
                    <span className="flex gap-1.5">
                      <button type="button" className="btn primary small" onClick={() => onOpen(h)} aria-label={`${t.place} ${t.big} を開く`}>
                        開く
                      </button>
                      <button type="button" className="btn small" onClick={() => onRemove(g.members)} aria-label={`${t.place} ${t.big} を履歴から消す`}>
                        消す
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </Overlay>
  );
}

export function CompareOverlay({ items, current, onAddCurrent, onOpen, onRemove, onClear, onClose }: { items: CompareItem[]; current: boolean; onAddCurrent: () => void; onOpen: (c: CompareItem) => void; onRemove: (c: CompareItem) => void; onClear: () => void; onClose: () => void }) {
  const rows = compareTable(items);
  return (
    <Overlay
      title="並べて比較"
      hint="調べた物件の要点を横に並べます（地図データからの目安。良し悪しは決めません）"
      onClose={onClose}
      actions={
        <>
          {current && (
            <button type="button" className="btn small" onClick={onAddCurrent}>
              今の物件を加える
            </button>
          )}
          {items.length > 0 && (
            <button type="button" className="btn ghost small" onClick={onClear}>
              全部外す
            </button>
          )}
        </>
      }
    >
      {items.length < 2 ? (
        <p className="desk-empty">
          <b>{items.length ? "もう1件入れると並べられます" : "比べる物件がまだありません"}</b>
          カルテの「比較に加える」で、2〜4件入れてください{items.length ? `（いま ${items[0].title}）` : ""}。
        </p>
      ) : null}
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="desk-board">
            <thead>
              <tr>
                <th scope="col" className="w-[170px]">
                  <span className="sr-only">項目</span>
                </th>
                {items.map((c) => (
                  <th key={c.key} scope="col">
                    <span className="num block text-[20px] font-medium">{c.title}</span>
                    <span className="block text-[12.5px] font-normal text-[var(--muted)]">{c.place}</span>
                    <span className="mt-1.5 flex gap-1.5">
                      <button type="button" className="btn small" onClick={() => onOpen(c)} aria-label={`${c.title} を開く`}>
                        開く
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => onRemove(c)} aria-label={`${c.title} を比較から外す`}>
                        外す
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">
                    {r.label}
                    {r.note && <span className="block text-[11px]">{r.note}</span>}
                  </th>
                  {r.cells.map((v, i) => (
                    <td key={items[i].key} className={/^[約\d]/.test(v) ? "num" : ""}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="desk-small">比べる値は、加えたときに読めていたデータの写しです（この端末だけに保存）。面積・辺の数・接する長さは地図データからの目安で、公簿の地積・測量の結果ではありません。</p>
        </div>
      )}
    </Overlay>
  );
}

export function GuideOverlay({ onClose, mac }: { onClose: () => void; mac: boolean }) {
  const k = mac ? "⌘K" : "Ctrl+K";
  return (
    <Overlay title="使い方" hint="3つの手順" narrow onClose={onClose}>
      <div className="desk-steps">
        <div className="desk-step">
          <div className="no">1</div>
          <b>住所か地番を入れる</b>
          上の検索欄に入れて「調べる」。<span className="kbd">{k}</span> か <span className="kbd">/</span> で検索欄へ。住所が分からない土地は、地図をクリックして「ここで調べる」。場所がずれていたら、地図のピンを動かして直せます。
        </div>
        <div className="desk-step">
          <div className="no">2</div>
          <b>カルテを読む</b>
          右のカルテに道路・法令・ハザード・周辺・相場・筆と隣地が並びます。道路の項目から市区町村の公式の道路図を開けます。「地図」と「3D」は真ん中の上で切り替えます。
        </div>
        <div className="desk-step">
          <div className="no">3</div>
          <b>書類にする</b>
          「書類を作る」で重説の下書き・調査レポート・照会文（送る・ひな形）・謄本用の地番・案内図・調査メモができます。お気に入りと比較で、何件も同時に進められます。
        </div>
      </div>
      <h3 className="desk-subhead mt-5">キーボード</h3>
      <dl className="desk-kv max-w-[520px]">
        <dt>
          <span className="kbd">{k}</span> <span className="kbd">/</span>
        </dt>
        <dd className="text-left">検索欄へ（入っている住所を選んだ状態）</dd>
        <dt>
          <span className="kbd">Esc</span>
        </dt>
        <dd className="text-left">重ねて開いた画面を閉じる・大きく見るのをやめる</dd>
        <dt>
          <span className="kbd">←</span> <span className="kbd">→</span> <span className="kbd">＋</span> <span className="kbd">−</span>
        </dt>
        <dd className="text-left">3D を回す・寄る・引く（3D をクリックしてから）</dd>
        <dt>
          <span className="kbd">Shift</span>＋ドラッグ
        </dt>
        <dd className="text-left">3D を地面ごと動かす</dd>
      </dl>
      <div className="desk-note mt-5 max-w-none">
        <b>MICHILU は判定をしません。</b>
        建てられるか・接道を満たすかなどは判断せず、調べた情報と確認先を出します。表示される情報は参考です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
      </div>
    </Overlay>
  );
}

const ORDER: Municipality["coverage"][] = ["full", "partial", "none", "outside", "unknown"];

export function AreaOverlay({ onClose }: { onClose: () => void }) {
  const prefs = REGION_ORDER.flatMap((r) => Object.values(REGIONS[r].prefs).map((name) => ({ region: REGIONS[r].name, name, list: MUNICIPALITIES.filter((m) => m.pref === name) })));
  const [pref, setPref] = useState<string | null>(null);
  const shown = prefs.find((p) => p.name === pref);
  return (
    <Overlay title="対応エリア" hint={`${AREA_LABEL}・${MUNICIPALITIES.length}市区町村`} narrow onClose={onClose}>
      {REGION_ORDER.map((r) => (
        <section key={r} aria-label={REGIONS[r].name} className="mb-3">
          <h3 className="desk-datehead">{REGIONS[r].name}</h3>
          <div className="desk-areas">
            {prefs
              .filter((p) => p.region === REGIONS[r].name)
              .map((p) => (
                <button key={p.name} type="button" aria-pressed={pref === p.name} onClick={() => setPref(pref === p.name ? null : p.name)}>
                  <b>{p.name}</b>
                  <span>{p.list.length}市区町村</span>
                </button>
              ))}
          </div>
        </section>
      ))}
      {shown && (
        <section className="paper mt-2" aria-label={`${shown.name}の市区町村`}>
          <h3 className="mb-2 text-[14px] font-bold">{shown.name}</h3>
          <div className="space-y-2.5">
            {ORDER.map((cov) => {
              const list = shown.list.filter((m) => m.coverage === cov);
              if (!list.length) return null;
              return (
                <div key={cov}>
                  <div className="mb-0.5 flex items-center gap-2">
                    <CoverageBadge coverage={cov} />
                    <span className="text-[11px] text-muted">{list.length}</span>
                  </div>
                  <p className="text-[12.5px] leading-[1.7]">{list.map((m) => m.name).join("、")}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <p className="desk-small">一覧にない市区町村は「未対応」と表示されます。道路種別の地図のリンクは、毎週自動で開けるかを確かめています。</p>
    </Overlay>
  );
}

export function SettingsOverlay({
  prefs,
  setPrefs,
  motion,
  setMotion,
  google,
  onClose,
  onClearCompare,
}: {
  prefs: DeskPrefs;
  setPrefs: (p: DeskPrefs) => void;
  motion: boolean;
  setMotion: (on: boolean) => void;
  google: GoogleFail | "ok" | "idle";
  onClose: () => void;
  onClearCompare: () => void;
}) {
  const radio = <K extends keyof DeskPrefs>(key: K, value: DeskPrefs[K], label: string) => (
    <label key={String(value)}>
      <input type="radio" name={`desk-${key}`} checked={prefs[key] === value} onChange={() => setPrefs({ ...prefs, [key]: value })} />
      {label}
    </label>
  );
  return (
    <Overlay title="設定" hint="この端末だけに保存されます" narrow onClose={onClose}>
      <div className="desk-setrow">
        <div>
          <div className="k">見た目</div>
          <div className="d">板の色。地図と 3D の色は変わりません</div>
        </div>
        <div className="desk-opt" role="radiogroup" aria-label="見た目">
          {radio("theme", "auto", "端末に合わせる")}
          {radio("theme", "light", "明るい")}
          {radio("theme", "dark", "暗い")}
        </div>
      </div>
      <div className="desk-setrow">
        <div>
          <div className="k">動きの演出</div>
          <div className="d">カルテ・重ねる画面の出方、3D の動き。端末の「視差効果を減らす」がオンなら、いつも動かしません</div>
        </div>
        <div className="desk-opt" role="radiogroup" aria-label="動きの演出">
          <label>
            <input type="radio" name="desk-motion" checked={motion} onChange={() => setMotion(true)} />
            あり
          </label>
          <label>
            <input type="radio" name="desk-motion" checked={!motion} onChange={() => setMotion(false)} />
            なし
          </label>
        </div>
      </div>
      <div className="desk-setrow">
        <div>
          <div className="k">3D の光（時間帯）</div>
          <div className="d">「時計に合わせる」は物件の場所の今の太陽で決めます。上の帯の朝・昼・夕・夜を押すと、選んだ時間帯になります</div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="desk-opt" role="radiogroup" aria-label="時間帯の決め方">
            {radio("todMode", "clock", "時計に合わせる")}
            {radio("todMode", "manual", "上の帯で選ぶ")}
          </div>
          {prefs.todMode === "manual" && (
            <div className="desk-opt" role="radiogroup" aria-label="時間帯">
              {TODS.map((t) => radio("tod", t, TOD_LABEL[t]))}
            </div>
          )}
        </div>
      </div>
      <div className="desk-setrow">
        <div>
          <div className="k">3D の初めの寄り</div>
          <div className="d">3D を開いたときの、物件からの距離</div>
        </div>
        <div className="desk-opt" role="radiogroup" aria-label="3D の初めの寄り">
          {radio("zoom", "near", "近く")}
          {radio("zoom", "mid", "ふつう")}
          {radio("zoom", "far", "広く")}
        </div>
      </div>
      <div className="desk-setrow">
        <div>
          <div className="k">3D（Google の実写）</div>
          <div className="d">3D を開いたときだけ Google から読み込みます（1 回で 3 時間まで使い回します）</div>
        </div>
        <p className="text-[13px]">
          {google === "ok" ? "使えます" : google === "idle" ? "まだ読み込んでいません（3D を開くと読み込みます）" : googleFailText(google)}
          {google !== "nokey" && (
            <a className="ml-2 inline-flex items-center gap-1 text-[12.5px]" href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">
              Google Maps Platform 利用規約
              <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </p>
      </div>
      <div className="desk-setrow">
        <div>
          <div className="k">書類の差出人</div>
          <div className="d">照会文の最後・調査メモと案内図の右上に入ります</div>
        </div>
        <div className="paper max-w-[460px]">
          <SenderFields />
        </div>
      </div>
      <div className="desk-setrow">
        <div>
          <div className="k">比較</div>
          <div className="d">並べて比較に入れた物件の写し</div>
        </div>
        <div>
          <button type="button" className="btn small" onClick={onClearCompare}>
            比較を全部外す
          </button>
        </div>
      </div>
    </Overlay>
  );
}
