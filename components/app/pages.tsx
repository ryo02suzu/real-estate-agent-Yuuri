"use client";

// 紺の見た目のページ：検索履歴、お気に入り、書類・出力、その他、見つからない・候補から選ぶ・未対応のときの画面。
// どれも上の写真の部分・白いカード・下のメニューは同じで、カードの中身だけが変わる（デザインの絵と同じ系統）。
// 検索する前のホームは components/app/home.tsx
import {
  ChevronRight,
  CircleHelp,
  ClipboardCopy,
  Database,
  Ellipsis,
  FileText,
  Info,
  ListChecks,
  LogIn,
  Map as MapIcon,
  MapPin,
  Printer,
  ScrollText,
  Search,
  Share2,
  Star,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { favoriteKey, type FavoriteItem } from "@/lib/favorites";
import { historyKey, type HistoryItem } from "@/lib/history";
import type { LookupResult } from "@/lib/roadmap";
import { ClockBack } from "./icons";
import { PropertyHeader } from "./property-head";
import { TileMap } from "./tile-map";
import { BLUE, INK2, NAVY, SUB } from "./ui";

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

function SectionTitle({ title, onMore, more = "すべて見る" }: { title: string; onMore?: () => void; more?: string }) {
  return (
    <div className="mt-[12px] flex items-center justify-between px-[9.2px]">
      <h3 className="font-bold leading-none" style={{ fontSize: 9.8, color: "#111827" }}>
        {title}
      </h3>
      {onMore && (
        <button onClick={onMore} className="flex items-center gap-[1px] font-medium leading-none" style={{ fontSize: 7.4, color: BLUE }}>
          {more}
          <ChevronRight size={8} strokeWidth={1.5} absoluteStrokeWidth color={BLUE} />
        </button>
      )}
    </div>
  );
}

const when = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 履歴・お気に入りの1行 */
function PlaceRow({ item, onClick, right, line = true }: { item: HistoryItem; onClick: () => void; right?: ReactNode; line?: boolean }) {
  return (
    <div className={`flex items-center gap-[7px] px-[9.2px] ${line ? "border-b-[0.6px] border-[#eef2f6]" : ""}`}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-[8px] py-[8px] text-left active:opacity-70">
        <span className="flex shrink-0 items-center justify-center rounded-full bg-[#f2f5f9]" style={{ width: 22, height: 22 }}>
          {item.ll ? <MapIcon size={10} strokeWidth={1.4} absoluteStrokeWidth color={NAVY} /> : <MapPin size={10} strokeWidth={1.4} absoluteStrokeWidth color={NAVY} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 8.2, color: INK2 }}>
            {item.address}
          </span>
          <span className="mt-[2px] block truncate leading-none" style={{ fontSize: 6.6, color: SUB }}>
            {[item.city, item.ll ? "地図で選んだ地点" : "", when(item.at)].filter(Boolean).join("・")}
          </span>
        </span>
        <ChevronRight size={9} strokeWidth={1.4} absoluteStrokeWidth color="#1d2b48" className="shrink-0" />
      </button>
      {right}
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

const DOCS: { Icon: LucideIcon; title: string; sub: string }[] = [
  { Icon: ListChecks, title: "要注意点と次にやること", sub: "問題になりそうな所と、窓口ごとに確かめることの一覧" },
  { Icon: Printer, title: "調査メモ（印刷・PDF）", sub: "道路・法令・ハザード・地価・周辺環境をA4にまとめる" },
  { Icon: ScrollText, title: "重説・物件概要の下書き", sub: "重要事項説明書・販売図面の欄の順に、コピーして使える" },
  { Icon: MapIcon, title: "案内図（印刷・PDF）", sub: "物件の場所の地図（A4）" },
  { Icon: ClipboardCopy, title: "結果の文面", sub: "メール・チャット・社内の報告にそのまま貼れる文" },
];

/** 書類・出力（物件を開いていないとき）。作れる書類と、最近調べた物件から作る入口 */
export function DocsPage({ history, onPick }: { history: HistoryItem[]; onPick: (h: HistoryItem) => void }) {
  return (
    <>
      <PageHead icon={<FileText size={13} strokeWidth={1.6} absoluteStrokeWidth color={NAVY} />} title="書類・出力" sub="物件を調べると、その物件の書類をすぐ作れます。どれも参考の資料です。" />
      <div className="mt-[6px]">
        {DOCS.map((d, i) => (
          <div key={d.title} className={`flex items-center gap-[8px] px-[9.2px] py-[8px] ${i < DOCS.length - 1 ? "border-b-[0.6px] border-[#eef2f6]" : ""}`}>
            <span className="flex shrink-0 items-center justify-center rounded-full bg-[#f2f5f9]" style={{ width: 22, height: 22 }}>
              <d.Icon size={10} strokeWidth={1.4} absoluteStrokeWidth color={NAVY} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-[1.3]" style={{ fontSize: 8.2, color: INK2 }}>
                {d.title}
              </span>
              <span className="mt-[2px] block leading-[1.4]" style={{ fontSize: 6.6, color: SUB }}>
                {d.sub}
              </span>
            </span>
          </div>
        ))}
      </div>
      <SectionTitle title="最近調べた物件から作る" />
      {history.length ? (
        <div className="mt-[2px]">
          {history.slice(0, 5).map((h, i, a) => (
            <PlaceRow key={historyKey(h)} item={h} onClick={() => onPick(h)} line={i < a.length - 1} />
          ))}
        </div>
      ) : (
        <p className="mt-[6px] px-[9.2px] leading-[1.5]" style={{ fontSize: 7.2, color: "#8a95a6" }}>
          まだありません。ホームで物件を調べると、ここから書類を作れます。
        </p>
      )}
      <Disclaimer />
    </>
  );
}

export function HistoryPage({ history, isFavorite, onToggleFavorite, onPick, onClear }: { history: HistoryItem[]; isFavorite: (h: HistoryItem) => boolean; onToggleFavorite: (h: HistoryItem) => void; onPick: (h: HistoryItem) => void; onClear: () => void }) {
  return (
    <>
      <PageHead icon={<ClockBack size={14} stroke={1.6} color={NAVY} />} title="検索履歴" sub={`最近調べた${history.length}件（この端末の中だけに保存・最大30件）`} />
      {history.length === 0 ? (
        <Empty icon={<ClockBack size={22} stroke={1.4} color="#9fb0c8" />} title="検索履歴はまだありません" body="住所・地番・地図で調べると、ここに残ります。顧客物件の住所なので、サーバーには送らず、この端末の中だけに保存します。" />
      ) : (
        <div className="mt-[6px]">
          {history.map((h, i) => (
            <PlaceRow
              key={historyKey(h)}
              item={h}
              onClick={() => onPick(h)}
              line={i < history.length - 1}
              right={
                <button onClick={() => onToggleFavorite(h)} aria-label={isFavorite(h) ? "お気に入りから外す" : "お気に入りに保存"} className="shrink-0 p-[4px]">
                  <Star size={11} strokeWidth={1.3} absoluteStrokeWidth color={isFavorite(h) ? "#f5a524" : "#9fb0c8"} fill={isFavorite(h) ? "#f5a524" : "none"} />
                </button>
              }
            />
          ))}
          <div className="mt-[10px] flex justify-center">
            <button onClick={onClear} className="flex items-center gap-[4px] rounded-full border border-[#e3e8ef] px-[12px] py-[6px] font-medium leading-none active:bg-[#f2f5f9]" style={{ fontSize: 7.4, color: SUB }}>
              <Trash2 size={9} strokeWidth={1.4} absoluteStrokeWidth />
              履歴をすべて消す
            </button>
          </div>
        </div>
      )}
      <Disclaimer />
    </>
  );
}

export function FavoritesPage({ favorites, onPick, onRemove }: { favorites: FavoriteItem[]; onPick: (f: FavoriteItem) => void; onRemove: (f: FavoriteItem) => void }) {
  return (
    <>
      <PageHead icon={<Star size={13} strokeWidth={1.5} absoluteStrokeWidth color={NAVY} />} title="お気に入り" sub={`保存した物件 ${favorites.length}件（この端末の中だけに保存・最大50件）`} />
      {favorites.length === 0 ? (
        <Empty
          icon={<Star size={22} strokeWidth={1.3} absoluteStrokeWidth color="#9fb0c8" />}
          title="保存した物件はまだありません"
          body="物件を調べた画面の右上の「お気に入り」を押すと保存できます。案内の前の下調べや、あとで見返したい物件に。"
        />
      ) : (
        <div className="mt-[6px]">
          {favorites.map((f, i) => (
            <PlaceRow
              key={favoriteKey(f)}
              item={f}
              onClick={() => onPick(f)}
              line={i < favorites.length - 1}
              right={
                <button onClick={() => onRemove(f)} aria-label="お気に入りから外す" className="shrink-0 p-[4px]">
                  <Trash2 size={10} strokeWidth={1.3} absoluteStrokeWidth color="#9fb0c8" />
                </button>
              }
            />
          ))}
        </div>
      )}
      <Disclaimer />
    </>
  );
}

export function AccountPage({ onHelp, onCities, onHistory, onFavorites, onSources, historyCount, favoriteCount }: { onHelp: () => void; onCities: () => void; onHistory: () => void; onFavorites: () => void; onSources: () => void; historyCount: number; favoriteCount: number }) {
  const rows: { Icon: LucideIcon | typeof ClockIconLike; label: string; sub?: string; onClick?: () => void }[] = [
    { Icon: ClockIconLike, label: "検索履歴", sub: `${historyCount}件`, onClick: onHistory },
    { Icon: Star, label: "お気に入り", sub: `${favoriteCount}件`, onClick: onFavorites },
    { Icon: CircleHelp, label: "使い方", onClick: onHelp },
    { Icon: MapPin, label: "対応している市区町村", onClick: onCities },
    { Icon: Database, label: "データの出典と更新", onClick: onSources },
  ];
  return (
    <>
      <PageHead icon={<Ellipsis size={13} strokeWidth={2} absoluteStrokeWidth color={NAVY} />} title="その他" sub="使い方・対応エリア・データの出典。履歴とお気に入りは、この端末の中だけに保存しています。" />
      <div className="mx-[9.2px] mt-[8px] rounded-[9px] bg-[linear-gradient(135deg,#1b4280_0%,#133664_55%,#0a2248_100%)] px-[11px] py-[10px] text-white">
        <p className="flex items-center gap-[6px] font-bold leading-none" style={{ fontSize: 8.6 }}>
          <LogIn size={11} strokeWidth={1.6} absoluteStrokeWidth />
          ログイン・会社での共有
          <span className="rounded-full bg-white/20 px-[6px] py-[2.5px] font-bold leading-none" style={{ fontSize: 6.2 }}>
            準備中
          </span>
        </p>
        <p className="mt-[6px] leading-[1.55] text-white/85" style={{ fontSize: 6.9 }}>
          同じ会社の人と物件を共有するには、物件の情報をサーバーに置く必要があります。今は、顧客物件の住所をサーバーに送らない作りにしているので、共有は「この情報を共有」（文面）で行ってください。
        </p>
      </div>
      <div className="mt-[6px]">
        {rows.map((r, i) => (
          <button key={r.label} onClick={r.onClick} className={`flex w-full items-center gap-[8px] px-[9.2px] py-[9px] text-left active:bg-[#f7f9fd] ${i < rows.length - 1 ? "border-b-[0.6px] border-[#eef2f6]" : ""}`}>
            <r.Icon size={12} strokeWidth={1.5} absoluteStrokeWidth color={NAVY} />
            <span className="min-w-0 flex-1 font-semibold leading-none" style={{ fontSize: 8.2, color: INK2 }}>
              {r.label}
            </span>
            {r.sub && (
              <span className="leading-none" style={{ fontSize: 7, color: SUB }}>
                {r.sub}
              </span>
            )}
            <ChevronRight size={9} strokeWidth={1.4} absoluteStrokeWidth color="#1d2b48" />
          </button>
        ))}
      </div>
      <p className="mx-[9.2px] mt-[10px] leading-[1.6]" style={{ fontSize: 6.6, color: SUB }}>
        MICHILU（ミチル）は、不動産会社の営業のための調査アプリです。市区町村の公式の地図を物件の場所で開き、国・自治体の公開データ（都市計画・ハザード・地価・学区・駅など）をまとめて見られます。
      </p>
      <Disclaimer />
    </>
  );
}

/** 時計（ClockBack を lucide のアイコンと同じ渡し方で使う） */
function ClockIconLike({ size = 12, color }: { size?: number | string; color?: string; strokeWidth?: number; absoluteStrokeWidth?: boolean }) {
  return <ClockBack size={Number(size)} stroke={1.5} color={color} />;
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
