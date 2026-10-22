"use client";

// スマホの下のメニューのページ（履歴・お気に入り・書類・出力・その他）。iPhone のアプリと同じ形で、大きな見出しと白い角丸の一覧。
// 文字は 名前16pt・説明13pt・いちばん小さい字12pt、1行の高さは60pt前後、押せる所は44pt以上。中身と動きは前のページと同じ。
// 寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）
import {
  ChevronRight,
  CircleHelp,
  ClipboardCopy,
  Database,
  Info,
  ListChecks,
  LoaderCircle,
  LogIn,
  Map as MapIcon,
  MapPin,
  Printer,
  ScrollText,
  Star,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { placeParts, stamp } from "@/lib/app/scene";
import { favoriteKey, type FavoriteItem } from "@/lib/favorites";
import { historyKey, type HistoryItem } from "@/lib/history";
import { PAGE, SKY } from "./home";
import { ClockBack } from "./icons";
import { NAVY } from "./ui";

const HEAD = "#0f1b33";
const TEXT = "#162033";
const GRAY = "#5d6880";
const LIGHT = "#6b778a";

/** ページの枠：大きな見出し（上は時刻・電池の帯の色からつなぐ）と、その下の中身 */
function TabScreen({ title, sub, banner, children }: { title: string; sub?: string; banner?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-touch pb-[28px]" style={{ background: PAGE }}>
      <header className="px-[20px] pb-[6px] pt-[16px]" style={{ background: `linear-gradient(180deg,${SKY} 0%,${PAGE} 100%)` }}>
        <h1 className="font-bold leading-[1.2]" style={{ fontSize: 30, color: HEAD, letterSpacing: 0.4 }}>
          {title}
        </h1>
        {sub && (
          <p className="mt-[6px] leading-[1.5]" style={{ fontSize: 13, color: GRAY }}>
            {sub}
          </p>
        )}
      </header>
      {banner && <div className="px-[16px] pt-[10px]">{banner}</div>}
      <div className="px-[16px]">{children}</div>
    </div>
  );
}

/** 調べている・通信の失敗・お知らせ（ページの見出しの下） */
export function TabBanner({ loading, error, notice, onDismiss }: { loading: boolean; error: string | null; notice: string | null; onDismiss: () => void }) {
  if (loading)
    return (
      <p className="flex items-center gap-[8px] rounded-[12px] bg-[#eef4fb] px-[12px] py-[10px] leading-[1.5]" style={{ fontSize: 13, color: "#1c3a6a" }}>
        <LoaderCircle size={16} strokeWidth={1.8} absoluteStrokeWidth className="shrink-0 animate-spin" />
        調べています…
      </p>
    );
  const text = error ?? notice;
  if (!text) return null;
  return (
    <button onClick={onDismiss} className="flex w-full items-start gap-[8px] rounded-[12px] bg-[#fdf1ec] px-[12px] py-[10px] text-left leading-[1.55]" style={{ fontSize: 13, color: "#8a4f3a" }}>
      <TriangleAlert size={16} strokeWidth={1.8} absoluteStrokeWidth className="mt-[1px] shrink-0" />
      {text}
    </button>
  );
}

/** 白い角丸の一覧（上に小さな見出し） */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mt-[18px]">
      {title && (
        <h2 className="mb-[8px] px-[4px] font-bold leading-none" style={{ fontSize: 13, color: LIGHT, letterSpacing: 0.3 }}>
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-[16px] bg-white shadow-[0_2px_10px_rgba(20,45,85,0.06)]">{children}</div>
    </section>
  );
}

/** 一覧の1行。onClick があれば押せる（右に ›）。right は行の右の小さなボタン */
function Row({ icon, title, sub, onClick, right, value }: { icon: ReactNode; title: ReactNode; sub?: ReactNode; onClick?: () => void; right?: ReactNode; value?: string }) {
  const body = (
    <>
      <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 36, height: 36 }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-[1.35]" style={{ fontSize: 16, color: TEXT, fontFeatureSettings: '"palt"' }}>
          {title}
        </span>
        {sub && (
          <span className="mt-[2px] block leading-[1.45]" style={{ fontSize: 13, color: LIGHT }}>
            {sub}
          </span>
        )}
      </span>
      {value && (
        <span className="shrink-0" style={{ fontSize: 15, color: LIGHT }}>
          {value}
        </span>
      )}
    </>
  );
  return (
    <div className="flex items-center border-t border-[#eef2f6] first:border-t-0">
      {onClick ? (
        <button onClick={onClick} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-[12px] py-[10px] pl-[14px] pr-[10px] text-left active:bg-[#f5f8fc]">
          {body}
          <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
        </button>
      ) : (
        <div className="flex min-h-[60px] min-w-0 flex-1 items-center gap-[12px] py-[10px] pl-[14px] pr-[14px]">{body}</div>
      )}
      {right}
    </div>
  );
}

/** 何も無いときの白いカード */
function Empty({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="mt-[18px] flex flex-col items-center rounded-[16px] bg-white px-[24px] pb-[24px] pt-[26px] text-center shadow-[0_2px_10px_rgba(20,45,85,0.06)]">
      <span className="flex items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 56, height: 56 }}>
        {icon}
      </span>
      <p className="mt-[12px] font-bold leading-[1.4]" style={{ fontSize: 16, color: TEXT }}>
        {title}
      </p>
      <p className="mt-[6px] leading-[1.6]" style={{ fontSize: 13, color: GRAY }}>
        {body}
      </p>
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="mt-[20px] flex gap-[6px] px-[4px] leading-[1.6]" style={{ fontSize: 12, color: "#8a95a6" }}>
      <Info size={14} strokeWidth={1.7} absoluteStrokeWidth className="mt-[2px] shrink-0" />
      地図・データは参考情報です。MICHILUは判定をしません。重要事項説明などの最終確認は、必ず役所の窓口・公的な資料で行ってください。
    </p>
  );
}

/** 調べた物件の1行（市区町村から番地まで・日時と調べ方） */
function PlaceRow({ item, onClick, right }: { item: HistoryItem; onClick: () => void; right?: ReactNode }) {
  const { full, chiban } = placeParts(item);
  const how = chiban ? "地番で調べた" : item.ll ? "地図で選んだ地点" : "";
  return (
    <Row
      icon={item.ll ? <MapIcon size={17} strokeWidth={1.7} absoluteStrokeWidth color={NAVY} /> : <MapPin size={17} strokeWidth={1.7} absoluteStrokeWidth color={NAVY} />}
      title={full}
      sub={[stamp(item.at), how].filter(Boolean).join("・")}
      onClick={onClick}
      right={right}
    />
  );
}

export function HistoryPage({
  history,
  isFavorite,
  onToggleFavorite,
  onPick,
  onClear,
  banner,
}: {
  history: HistoryItem[];
  isFavorite: (h: HistoryItem) => boolean;
  onToggleFavorite: (h: HistoryItem) => void;
  onPick: (h: HistoryItem) => void;
  onClear: () => void;
  banner?: ReactNode;
}) {
  return (
    <TabScreen title="履歴" sub={history.length ? `${history.length}件・この端末だけに保存（最大30件）` : undefined} banner={banner}>
      {history.length === 0 ? (
        <Empty icon={<ClockBack size={26} stroke={1.7} color="#8fa3c2" />} title="検索履歴はまだありません" body="住所・地番・地図で調べると、ここに残ります。顧客物件の住所なので、サーバーには送らず、この端末の中だけに保存します。" />
      ) : (
        <>
          <Group>
            {history.map((h) => (
              <PlaceRow
                key={historyKey(h)}
                item={h}
                onClick={() => onPick(h)}
                right={
                  <button onClick={() => onToggleFavorite(h)} aria-label={isFavorite(h) ? "お気に入りから外す" : "お気に入りに保存"} className="mr-[4px] flex h-[44px] w-[44px] shrink-0 items-center justify-center active:opacity-60">
                    <Star size={20} strokeWidth={1.7} absoluteStrokeWidth color={isFavorite(h) ? "#f5a524" : "#a3adbd"} fill={isFavorite(h) ? "#f5a524" : "none"} />
                  </button>
                }
              />
            ))}
          </Group>
          <div className="mt-[16px] flex justify-center">
            <button onClick={onClear} className="flex h-[44px] items-center gap-[6px] rounded-full bg-white px-[18px] font-semibold shadow-[0_2px_8px_rgba(20,45,85,0.06)] active:bg-[#f5f8fc]" style={{ fontSize: 14, color: "#b4533c" }}>
              <Trash2 size={16} strokeWidth={1.7} absoluteStrokeWidth />
              履歴をすべて消す
            </button>
          </div>
        </>
      )}
      <Disclaimer />
    </TabScreen>
  );
}

export function FavoritesPage({ favorites, onPick, onRemove, banner }: { favorites: FavoriteItem[]; onPick: (f: FavoriteItem) => void; onRemove: (f: FavoriteItem) => void; banner?: ReactNode }) {
  return (
    <TabScreen title="お気に入り" sub={favorites.length ? `${favorites.length}件・この端末だけに保存（最大50件）` : undefined} banner={banner}>
      {favorites.length === 0 ? (
        <Empty
          icon={<Star size={26} strokeWidth={1.7} absoluteStrokeWidth color="#8fa3c2" />}
          title="保存した物件はまだありません"
          body="物件を調べた画面の右上の「お気に入り」を押すと保存できます。案内の前の下調べや、あとで見返したい物件に。"
        />
      ) : (
        <Group>
          {favorites.map((f) => (
            <PlaceRow
              key={favoriteKey(f)}
              item={f}
              onClick={() => onPick(f)}
              right={
                <button onClick={() => onRemove(f)} aria-label="お気に入りから外す" className="mr-[4px] flex h-[44px] w-[44px] shrink-0 items-center justify-center active:opacity-60">
                  <Trash2 size={19} strokeWidth={1.7} absoluteStrokeWidth color="#a3adbd" />
                </button>
              }
            />
          ))}
        </Group>
      )}
      <Disclaimer />
    </TabScreen>
  );
}

const DOCS: { Icon: LucideIcon; title: string; sub: string }[] = [
  { Icon: ListChecks, title: "要注意点と次にやること", sub: "問題になりそうな所と、窓口ごとに確かめること" },
  { Icon: Printer, title: "調査メモ（印刷・PDF）", sub: "道路・法令・ハザード・地価・周辺環境をA4に" },
  { Icon: ScrollText, title: "重説・物件概要の下書き", sub: "重要事項説明書・販売図面の欄の順に" },
  { Icon: MapIcon, title: "案内図（印刷・PDF）", sub: "物件の場所の地図（A4）" },
  { Icon: ClipboardCopy, title: "結果の文面", sub: "メール・チャット・社内の報告に貼れる文" },
];

/** 書類・出力（物件を開いていないとき）。作れる書類と、最近調べた物件から作る入口 */
export function DocsPage({ history, onPick, banner }: { history: HistoryItem[]; onPick: (h: HistoryItem) => void; banner?: ReactNode }) {
  return (
    <TabScreen title="書類・出力" sub="調べた物件の書類をすぐ作れます（参考の資料）" banner={banner}>
      <Group title="最近調べた物件から作る">
        {history.length ? (
          history.slice(0, 5).map((h) => <PlaceRow key={historyKey(h)} item={h} onClick={() => onPick(h)} />)
        ) : (
          <p className="px-[16px] py-[16px] leading-[1.6]" style={{ fontSize: 13, color: GRAY }}>
            まだありません。ホームで物件を調べると、ここから書類を作れます。
          </p>
        )}
      </Group>
      <Group title="作れる書類">
        {DOCS.map((d) => (
          <Row key={d.title} icon={<d.Icon size={17} strokeWidth={1.7} absoluteStrokeWidth color={NAVY} />} title={d.title} sub={d.sub} />
        ))}
      </Group>
      <Disclaimer />
    </TabScreen>
  );
}

/** その他（使い方・対応エリア・出典・履歴とお気に入りの入口） */
export function AccountPage({
  onHelp,
  onCities,
  onHistory,
  onFavorites,
  onSources,
  historyCount,
  favoriteCount,
  banner,
}: {
  onHelp: () => void;
  onCities: () => void;
  onHistory: () => void;
  onFavorites: () => void;
  onSources: () => void;
  historyCount: number;
  favoriteCount: number;
  banner?: ReactNode;
}) {
  const rows: { Icon: LucideIcon | typeof ClockLike; label: string; value?: string; onClick: () => void }[] = [
    { Icon: ClockLike, label: "検索履歴", value: `${historyCount}件`, onClick: onHistory },
    { Icon: Star, label: "お気に入り", value: `${favoriteCount}件`, onClick: onFavorites },
    { Icon: CircleHelp, label: "使い方", onClick: onHelp },
    { Icon: MapPin, label: "対応している市区町村", onClick: onCities },
    { Icon: Database, label: "データの出典と更新", onClick: onSources },
  ];
  return (
    <TabScreen title="その他" banner={banner}>
      <div className="mt-[14px] rounded-[16px] px-[16px] py-[14px] text-white" style={{ background: "linear-gradient(135deg,#1b4280 0%,#133664 55%,#0a2248 100%)" }}>
        <p className="flex items-center gap-[8px] font-bold leading-none" style={{ fontSize: 16 }}>
          <LogIn size={18} strokeWidth={1.8} absoluteStrokeWidth />
          ログイン・会社での共有
          <span className="rounded-full bg-white/20 px-[8px] py-[4px] font-bold leading-none" style={{ fontSize: 11 }}>
            準備中
          </span>
        </p>
        <p className="mt-[8px] leading-[1.6] text-white/85" style={{ fontSize: 13 }}>
          物件を会社で共有するには、物件の情報をサーバーに置く必要があります。今は顧客物件の住所をサーバーに送らない作りなので、共有は「結果の文面」で行ってください。
        </p>
      </div>
      <Group>
        {rows.map((r) => (
          <Row key={r.label} icon={<r.Icon size={17} strokeWidth={1.7} absoluteStrokeWidth color={NAVY} />} title={r.label} value={r.value} onClick={r.onClick} />
        ))}
      </Group>
      <p className="mt-[18px] px-[4px] leading-[1.65]" style={{ fontSize: 13, color: GRAY }}>
        MICHILU（ミチル）は、不動産会社の営業のための調査アプリです。市区町村の公式の地図を物件の場所で開き、国・自治体の公開データ（都市計画・ハザード・地価・学区・駅など）をまとめて見られます。
      </p>
      <Disclaimer />
    </TabScreen>
  );
}

/** 時計（ClockBack を lucide のアイコンと同じ渡し方で使う） */
function ClockLike({ size = 17, color }: { size?: number | string; color?: string; strokeWidth?: number; absoluteStrokeWidth?: boolean }) {
  return <ClockBack size={Number(size)} stroke={1.7} color={color} />;
}
