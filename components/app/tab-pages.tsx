"use client";

// スマホの下のメニューのページ（履歴・お気に入り・書類・出力・その他）。ホームと同じ系統：上に街の写真の帯（写真はまだ無いので
// NO IMAGE の札）、その帯に重ねるすりガラスのカード（そのページでいちばん使う操作）、白い角丸の一覧。
// 字は端末の標準の字（app/globals.css の .theme-navy）。大きさは iPhone の段階：帯の見出し28pt太字、章の見出し17pt太字、
// 行の名前15.5pt中太字、説明12.5pt、押せる所は44pt以上。寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）
import {
  Bell,
  ChevronRight,
  CircleHelp,
  ClipboardCopy,
  Database,
  FileText,
  Info,
  ListChecks,
  LoaderCircle,
  LogIn,
  Map as MapIcon,
  MapPin,
  Printer,
  ScrollText,
  Search,
  Smartphone,
  Star,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { placeholderScenes, placeParts, sceneSrc, SCENES, type SceneKey } from "@/lib/app/scene";
import { favoriteKey, type FavoriteItem } from "@/lib/favorites";
import { historyKey, type HistoryItem } from "@/lib/history";
import { MUNICIPALITIES } from "@/lib/roadmap";
import { PhoneImg, ScaledInput } from "./frame";
import { AURORA, PAGE } from "./home";
import { ClockBack } from "./icons";
import { NEWS } from "./news";
import { CARD, GLASS, Head, HEAD, LIGHT, NoImage, Note, Row, TEXT } from "./r-ui";
import { NAVY } from "./ui";

/** 写真の帯の高さと、ガラスのカードを重ねる量 */
const BAND_H = 124;
const OVERLAP = 28;

/** ページの枠：写真の帯（見出し・副題。右上に小さなボタン）、重ねるガラスのカード、その下の中身 */
function TabScreen({ title, sub, action, hero, banner, children }: { title: string; sub?: string; action?: ReactNode; hero?: ReactNode; banner?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-touch relative pb-[16px]" style={{ background: PAGE }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: BAND_H, background: AURORA }} />
      <div className="relative overflow-hidden" style={{ height: BAND_H }}>
        <NoImage top size={10} className="absolute inset-0" />
        <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,25,50,0.08) 0%, rgba(10,25,50,0) 30%, rgba(10,25,50,0.14) 55%, rgba(10,25,50,0.7) 100%)" }} />
        {action && (
          <div className="absolute" style={{ right: 8, top: 6 }}>
            {action}
          </div>
        )}
        <div className="absolute left-[20px] right-[20px]" style={{ bottom: OVERLAP + 10 }}>
          <h1 className="truncate font-bold leading-[1.15] text-white" style={{ fontSize: 27, textShadow: "0 1px 8px rgba(0,0,0,0.4)" }}>
            {title}
          </h1>
          {sub && (
            <p className="mt-[4px] truncate leading-none" style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
              {sub}
            </p>
          )}
        </div>
      </div>
      {hero && (
        <div className="relative mx-[16px] rounded-[22px] p-[9px] shadow-[0_14px_34px_rgba(20,48,95,0.13)]" style={{ ...GLASS, marginTop: -OVERLAP }}>
          {hero}
        </div>
      )}
      {banner && <div className="relative mt-[8px] px-[16px]">{banner}</div>}
      <div className="relative px-[16px]">{children}</div>
    </div>
  );
}

/** 調べている・通信の失敗（橙）・お知らせ（青）。ページの上 */
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
  const warn = !!error;
  return (
    <button onClick={onDismiss} className="flex w-full items-start gap-[8px] rounded-[12px] px-[12px] py-[10px] text-left leading-[1.55]" style={{ fontSize: 13, background: warn ? "#fdf1ec" : "#eef4fb", color: warn ? "#8a4f3a" : "#1c3a6a" }}>
      {warn ? <TriangleAlert size={16} strokeWidth={1.8} absoluteStrokeWidth className="mt-[1px] shrink-0" /> : <Info size={16} strokeWidth={1.8} absoluteStrokeWidth className="mt-[1px] shrink-0" />}
      {text}
    </button>
  );
}

/** ガラスのカードの中の検索の欄（iPhone で拡大しないよう、字は ScaledInput で描く） */
function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <form role="search" onSubmit={(e) => e.preventDefault()} className="flex h-[42px] items-center rounded-full border border-[#d8e0eb] bg-white pl-[12px] pr-[4px] shadow-[inset_0_1px_2px_rgba(20,45,85,0.05)] focus-within:border-[#9db8e6]">
      <Search size={17} strokeWidth={1.9} absoluteStrokeWidth color="#6b778a" className="shrink-0" />
      <ScaledInput value={value} onChange={onChange} placeholder={placeholder} label={label} size={15} autoComplete="off" className="ml-[8px] mr-[2px]" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="入力を消す" className="flex size-[34px] shrink-0 items-center justify-center rounded-full active:bg-[#eef2f7]">
          <X size={16} strokeWidth={2} absoluteStrokeWidth color="#8d97a8" />
        </button>
      )}
    </form>
  );
}

/** 絞り込みのチップ（ガラスのカードの中） */
function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className="press flex h-[32px] shrink-0 items-center rounded-full px-[12px] font-semibold leading-none transition-colors" style={{ fontSize: 13, background: on ? NAVY : "rgba(255,255,255,0.8)", color: on ? "#fff" : "#26324a", boxShadow: on ? "0 3px 10px rgba(15,47,95,0.22)" : "none" }}>
      {label}
    </button>
  );
}

/** 何も無いときの白いカード */
function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className={`mt-[14px] flex flex-col items-center px-[24px] pb-[22px] pt-[24px] text-center ${CARD}`}>
      <span className="flex items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 56, height: 56 }}>
        {icon}
      </span>
      <p className="mt-[12px] font-semibold leading-[1.4]" style={{ fontSize: 16, color: TEXT }}>
        {title}
      </p>
      <p className="mt-[6px] leading-[1.6]" style={{ fontSize: 13, color: LIGHT }}>
        {body}
      </p>
      {action && <div className="mt-[14px]">{action}</div>}
    </div>
  );
}

function Disclaimer() {
  return <Note className="mt-[16px] px-[4px]">地図・データは参考情報です。MICHILUは判定をしません。重要事項説明などの最終確認は、必ず役所の窓口・公的な資料で行ってください。</Note>;
}

/** 調べ方の種類（住所・地番・地図） */
type Kind = "address" | "chiban" | "map";
const KINDS: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "address", label: "住所" },
  { key: "chiban", label: "地番" },
  { key: "map", label: "地図" },
];
const kindOf = (h: HistoryItem): Kind => (h.ll ? "map" : placeParts(h).chiban ? "chiban" : "address");

/** 絞り込みの文字に合うか（町名・市区町村・住所のどこかに含む。全角・半角は同じに） */
function matches(h: HistoryItem, q: string): boolean {
  const n = q.normalize("NFKC").trim();
  if (!n) return true;
  return `${h.city ?? ""} ${h.address.normalize("NFKC")}`.includes(n);
}

/** 「今日」「昨日」「今週」「今月」「それより前」 */
function dayGroup(t: number, now: number): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date(now)) - day(new Date(t))) / 86400000);
  if (diff <= 0) return "今日";
  if (diff === 1) return "昨日";
  if (diff < 7) return "今週";
  if (diff < 31) return "今月";
  return "それより前";
}

/** 行に出す日時：今日・昨日は時刻だけ、それ以外は月日（年が違えば年も） */
function when(t: number, now: number): string {
  const d = new Date(t);
  const n = new Date(now);
  const p = (v: number) => String(v).padStart(2, "0");
  const g = dayGroup(t, now);
  if (g === "今日" || g === "昨日") return `${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.getFullYear() === n.getFullYear() ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 調べた物件の1行（写真の札・町名・市区町村と日時と調べ方）。右に小さなボタン */
function PlaceRow({ item, scene, time, onClick, trailing }: { item: HistoryItem; scene: SceneKey; time?: string; onClick: () => void; trailing?: ReactNode }) {
  const { city, town, full, chiban } = placeParts(item);
  const kind = chiban ? "・地番" : item.ll ? "・地図" : "";
  return (
    <li className="border-t border-[#eef2f6] first:border-t-0">
      <div className="flex items-center">
        <button onClick={onClick} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-[12px] py-[8px] pl-[10px] pr-[4px] text-left active:bg-[#f5f8fc]">
          <PhoneImg src={sceneSrc(scene)} alt="" loading="lazy" draggable={false} className="size-[46px] shrink-0 rounded-[13px] object-cover" style={{ objectPosition: `50% ${SCENES[scene].y}%` }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 15.5, color: TEXT }}>
              {town || full}
            </span>
            <span className="mt-[1px] block truncate leading-[1.35]" style={{ fontSize: 12.5, color: LIGHT }}>
              {[city || "対応エリアの外", time].filter(Boolean).join("・")}
              {kind}
            </span>
          </span>
          {!trailing && <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="mr-[6px] shrink-0" />}
        </button>
        {trailing}
      </div>
    </li>
  );
}

/** 行の右の丸いボタン（44pt） */
function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="press flex size-[44px] shrink-0 items-center justify-center rounded-full active:bg-[#eef2f7]">
      {children}
    </button>
  );
}

/** いまの時刻（ページを開いたときに決める。ページは開くたびに作り直されるので、それで足りる） */
function useNow(): number {
  return useState(() => Date.now())[0];
}

/** 写真の札を、一覧の順に決める（同じ写真が続かないように） */
function useScenes(items: readonly HistoryItem[]): Map<string, SceneKey> {
  return useMemo(() => {
    const keys = placeholderScenes(items);
    return new Map(items.map((h, i) => [historyKey(h), keys[i]]));
  }, [items]);
}

export function HistoryPage({
  history,
  isFavorite,
  onToggleFavorite,
  onPick,
  onClear,
  onHome,
  banner,
}: {
  history: HistoryItem[];
  isFavorite: (h: HistoryItem) => boolean;
  onToggleFavorite: (h: HistoryItem) => void;
  onPick: (h: HistoryItem) => void;
  onClear: () => void;
  onHome: () => void;
  banner?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [confirm, setConfirm] = useState(false);
  const now = useNow();
  // 「すべて消す」は2回押す（4秒で戻る）
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  const scenes = useScenes(history);
  const counts = useMemo(() => {
    const c = { all: history.length, address: 0, chiban: 0, map: 0 };
    for (const h of history) c[kindOf(h)]++;
    return c;
  }, [history]);
  const list = history.filter((h) => (kind === "all" || kindOf(h) === kind) && matches(h, q));
  // 日付ごとの章（新しい順のまま）
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const h of list) {
    const label = dayGroup(h.at, now);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(h);
    else groups.push({ label, items: [h] });
  }

  return (
    <TabScreen
      title="履歴"
      sub={history.length ? `${history.length}件・この端末だけに保存（最大30件）` : "調べた物件がここに残ります"}
      hero={
        <>
          <SearchField value={q} onChange={setQ} placeholder="町名・市区町村でしぼる" label="履歴を検索" />
          <div className="mt-[8px] flex gap-[6px]">
            {KINDS.map((k) => (
              <Chip key={k.key} label={counts[k.key] ? `${k.label} ${counts[k.key]}` : k.label} on={kind === k.key} onClick={() => setKind(k.key)} />
            ))}
          </div>
        </>
      }
      banner={banner}
    >
      {history.length === 0 ? (
        <Empty
          icon={<ClockBack size={26} stroke={1.7} color="#8fa3c2" />}
          title="検索履歴はまだありません"
          body="住所・地番・地図で調べると、ここに残ります。顧客物件の住所なのでサーバーには送らず、この端末の中だけに保存します。"
          action={
            <button onClick={onHome} className="press flex h-[40px] items-center gap-[6px] rounded-full px-[16px] font-semibold leading-none text-white" style={{ fontSize: 14, background: NAVY }}>
              <Search size={15} strokeWidth={2} absoluteStrokeWidth />
              ホームで調べる
            </button>
          }
        />
      ) : list.length === 0 ? (
        <Empty icon={<Search size={26} strokeWidth={1.7} absoluteStrokeWidth color="#8fa3c2" />} title="当てはまる履歴がありません" body="絞り込みの文字や種類を変えてみてください。" />
      ) : (
        groups.map((g) => (
          <section key={g.label}>
            <Head title={g.label} note={`${g.items.length}件`} className="mt-[10px]" />
            <ul className={`overflow-hidden ${CARD}`}>
              {g.items.map((h) => (
                <PlaceRow
                  key={historyKey(h)}
                  item={h}
                  scene={scenes.get(historyKey(h)) ?? "suburb"}
                  time={when(h.at, now)}
                  onClick={() => onPick(h)}
                  trailing={
                    <IconButton label={isFavorite(h) ? "お気に入りから外す" : "お気に入りに保存"} onClick={() => onToggleFavorite(h)}>
                      <Star size={21} strokeWidth={1.7} absoluteStrokeWidth color={isFavorite(h) ? "#f5a524" : "#a3adbd"} fill={isFavorite(h) ? "#f5a524" : "none"} />
                    </IconButton>
                  }
                />
              ))}
            </ul>
          </section>
        ))
      )}
      {history.length > 0 && (
        <div className="mt-[16px] flex justify-center">
          <button
            onClick={() => {
              if (confirm) {
                setConfirm(false);
                onClear();
              } else setConfirm(true);
            }}
            className="press flex h-[44px] items-center gap-[6px] rounded-full px-[18px] font-semibold shadow-[0_2px_8px_rgba(20,45,85,0.06)] transition-colors"
            style={{ fontSize: 15, background: confirm ? "#c0391b" : "#fff", color: confirm ? "#fff" : "#b4533c" }}
          >
            <Trash2 size={16} strokeWidth={1.8} absoluteStrokeWidth />
            {confirm ? "もう一度押すと消えます" : "履歴をすべて消す"}
          </button>
        </div>
      )}
      <Disclaimer />
    </TabScreen>
  );
}

export function FavoritesPage({
  favorites,
  onPick,
  onDocs,
  onRemove,
  onHome,
  banner,
}: {
  favorites: FavoriteItem[];
  onPick: (f: FavoriteItem) => void;
  /** その物件の書類を作る（レポートの画面） */
  onDocs: (f: FavoriteItem) => void;
  onRemove: (f: FavoriteItem) => void;
  onHome: () => void;
  banner?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [byCity, setByCity] = useState(false);
  const now = useNow();
  const scenes = useScenes(favorites);
  const list = favorites.filter((f) => matches(f, q));
  const groups: { label: string; items: FavoriteItem[] }[] = [];
  if (byCity) {
    const m = new Map<string, FavoriteItem[]>();
    for (const f of list) {
      const k = f.city ?? "対応エリアの外";
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    for (const [label, items] of [...m.entries()].sort((a, b) => b[1].length - a[1].length)) groups.push({ label, items });
  } else groups.push({ label: "", items: list });
  const trailing = (f: FavoriteItem) => (
    <span className="flex shrink-0 items-center">
      <IconButton label="この物件の書類を作る" onClick={() => onDocs(f)}>
        <FileText size={20} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />
      </IconButton>
      <IconButton label="お気に入りから外す" onClick={() => onRemove(f)}>
        <Star size={21} strokeWidth={1.7} absoluteStrokeWidth color="#f5a524" fill="#f5a524" />
      </IconButton>
    </span>
  );

  return (
    <TabScreen
      title="お気に入り"
      sub={favorites.length ? `${favorites.length}件・この端末だけに保存（最大50件）` : "案内の前の下調べや、見返したい物件を"}
      hero={
        <>
          <SearchField value={q} onChange={setQ} placeholder="町名・市区町村でしぼる" label="お気に入りを検索" />
          <div className="mt-[8px] flex gap-[6px]">
            <Chip label="新しい順" on={!byCity} onClick={() => setByCity(false)} />
            <Chip label="市区町村ごと" on={byCity} onClick={() => setByCity(true)} />
          </div>
        </>
      }
      banner={banner}
    >
      {favorites.length === 0 ? (
        <Empty
          icon={<Star size={26} strokeWidth={1.7} absoluteStrokeWidth color="#8fa3c2" />}
          title="保存した物件はまだありません"
          body="物件を調べた画面の右上の ☆ を押すと保存できます。履歴の行の ☆ からも保存できます。"
          action={
            <button onClick={onHome} className="press flex h-[40px] items-center gap-[6px] rounded-full px-[16px] font-semibold leading-none text-white" style={{ fontSize: 14, background: NAVY }}>
              <Search size={15} strokeWidth={2} absoluteStrokeWidth />
              ホームで調べる
            </button>
          }
        />
      ) : list.length === 0 ? (
        <Empty icon={<Search size={26} strokeWidth={1.7} absoluteStrokeWidth color="#8fa3c2" />} title="当てはまる物件がありません" body="絞り込みの文字を変えてみてください。" />
      ) : (
        groups.map((g) => (
          <section key={g.label || "all"}>
            {g.label ? <Head title={g.label} note={`${g.items.length}件`} className="mt-[10px]" /> : <div className="h-[14px]" />}
            <ul className={`overflow-hidden ${CARD}`}>
              {g.items.map((f) => (
                <PlaceRow key={favoriteKey(f)} item={f} scene={scenes.get(historyKey(f)) ?? "suburb"} time={when(f.at, now)} onClick={() => onPick(f)} trailing={trailing(f)} />
              ))}
            </ul>
          </section>
        ))
      )}
      <Disclaimer />
    </TabScreen>
  );
}

/** 作れる書類（押すと、その書類をすぐ開く） */
export type DocKind = "triage" | "memo" | "draft" | "guide" | "copy";
const DOCS: { kind: DocKind; Icon: LucideIcon; title: string; sub: string }[] = [
  { kind: "triage", Icon: ListChecks, title: "要注意点と次にやること", sub: "問題になりそうな所と、窓口ごとに確かめること（済んだ印を付けられます）" },
  { kind: "memo", Icon: Printer, title: "調査メモ", sub: "A4に印刷・PDF" },
  { kind: "draft", Icon: ScrollText, title: "重説の下書き", sub: "物件概要も一緒に" },
  { kind: "guide", Icon: MapIcon, title: "案内図", sub: "A4に印刷・PDF" },
  { kind: "copy", Icon: ClipboardCopy, title: "結果の文面", sub: "コピーして貼る" },
];

function DocTile({ Icon, title, sub, wide, onClick }: { Icon: LucideIcon; title: string; sub: string; wide?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${wide ? "col-span-2" : ""} press-soft flex items-center gap-[10px] rounded-[14px] bg-white px-[11px] py-[8px] text-left shadow-[0_2px_8px_rgba(20,45,85,0.06)] active:bg-[#f5f8fc]`} style={{ minHeight: 52 }}>
      <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 34, height: 34 }}>
        <Icon size={17} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold leading-[1.25]" style={{ fontSize: 14, color: TEXT }}>
          {title}
        </span>
        <span className={`mt-[2px] block leading-[1.3] ${wide ? "" : "truncate"}`} style={{ fontSize: 11.5, color: LIGHT }}>
          {sub}
        </span>
      </span>
      {wide && <ChevronRight size={16} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />}
    </button>
  );
}

/** 書類・出力：作れる書類のタイル（押すとすぐ開く）、いま開いている物件、最近調べた物件から作る */
export function DocsPage({
  current,
  history,
  onMake,
  onReport,
  onPick,
  onHistory,
  banner,
}: {
  /** いま開いている物件（無ければ undefined） */
  current?: HistoryItem;
  history: HistoryItem[];
  /** 書類の種類を押した（開いている物件、無ければ最近の物件で作る） */
  onMake: (kind: DocKind) => void;
  /** 開いている物件のレポートの画面 */
  onReport: () => void;
  /** 最近の物件を選んで、その物件のレポートの画面 */
  onPick: (h: HistoryItem) => void;
  /** 履歴のページ（4件目から） */
  onHistory: () => void;
  banner?: ReactNode;
}) {
  // 1画面に収めるため3件まで（開いている物件の行があるときは2件。続きは履歴のページから）
  const others = history.filter((h) => !current || historyKey(h) !== historyKey(current));
  const recent = others.slice(0, current ? 2 : 3);
  const all = useMemo(() => (current ? [current, ...recent] : recent), [current, recent]);
  const scenes = useScenes(all);
  const now = useNow();
  return (
    <TabScreen
      title="書類・出力"
      sub={current ? `${placeParts(current).town || placeParts(current).full} の書類を作れます` : "調べた物件から、参考の資料をすぐ作れます"}
      hero={
        <>
          <p className="px-[4px] pt-[2px] font-semibold leading-none" style={{ fontSize: 13, color: HEAD }}>
            作れる書類{current ? "（いま開いている物件）" : history.length ? "（最近調べた物件）" : ""}
          </p>
          <div className="mt-[8px] grid grid-cols-2 gap-[6px]">
            {DOCS.map((d, i) => (
              <DocTile key={d.kind} Icon={d.Icon} title={d.title} sub={d.sub} wide={i === 0} onClick={() => onMake(d.kind)} />
            ))}
          </div>
        </>
      }
      banner={banner}
    >
      {current && (
        <section>
          <Head title="いま開いている物件" className="mt-[10px]" />
          <ul className={`overflow-hidden ${CARD}`}>
            <PlaceRow item={current} scene={scenes.get(historyKey(current)) ?? "suburb"} time={when(current.at, now)} onClick={onReport} />
          </ul>
        </section>
      )}
      <section>
        <Head title={current ? "ほかの物件から作る" : "最近調べた物件から作る"} note="押すとレポートの画面" more="履歴" onMore={others.length > recent.length ? onHistory : undefined} className="mt-[10px]" />
        {recent.length ? (
          <ul className={`overflow-hidden ${CARD}`}>
            {recent.map((h) => (
              <PlaceRow key={historyKey(h)} item={h} scene={scenes.get(historyKey(h)) ?? "suburb"} time={when(h.at, now)} onClick={() => onPick(h)} />
            ))}
          </ul>
        ) : (
          <p className={`px-[16px] py-[16px] leading-[1.6] ${CARD}`} style={{ fontSize: 13, color: LIGHT }}>
            {current ? "ほかに調べた物件はまだありません。" : "まだありません。ホームで物件を調べると、ここから書類を作れます。"}
          </p>
        )}
      </section>
      <Note className="mt-[12px] px-[4px]">どれも参考の資料です（iPhone はプリントの画面から PDF にできます）。最終確認は役所の窓口・公的な資料で。</Note>
    </TabScreen>
  );
}

/** その他：履歴とお気に入りの札、ログイン（準備中）、使い方とデータ、アプリ。1画面に収める */
export function AccountPage({
  onHelp,
  onCities,
  onHistory,
  onFavorites,
  onSources,
  onNews,
  unread,
  onInstall,
  standalone,
  historyCount,
  favoriteCount,
  banner,
}: {
  onHelp: () => void;
  onCities: () => void;
  onHistory: () => void;
  onFavorites: () => void;
  onSources: () => void;
  onNews: () => void;
  unread: boolean;
  onInstall: () => void;
  standalone: boolean;
  historyCount: number;
  favoriteCount: number;
  banner?: ReactNode;
}) {
  const icon = (Icon: LucideIcon) => <Icon size={17} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />;
  const stat = (label: string, count: number, ic: ReactNode, onClick: () => void) => (
    <button onClick={onClick} className="press-soft flex min-w-0 flex-1 items-center gap-[10px] rounded-[14px] bg-white px-[12px] text-left shadow-[0_2px_8px_rgba(20,45,85,0.06)] active:bg-[#f5f8fc]" style={{ height: 58 }}>
      <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 34, height: 34 }}>
        {ic}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
          {label}
        </span>
        <span className="mt-[4px] block truncate font-bold leading-none" style={{ fontSize: 18, color: TEXT }}>
          {count}
          <span className="ml-[2px] font-semibold" style={{ fontSize: 12 }}>
            件
          </span>
        </span>
      </span>
      <ChevronRight size={16} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
    </button>
  );
  return (
    <TabScreen
      title="その他"
      sub="MICHILU（ミチル）・不動産の現場に、すぐ使える情報を。"
      action={
        <button onClick={onNews} aria-label={unread ? "お知らせ（新しいお知らせがあります）" : "お知らせ"} className="press relative flex size-[36px] items-center justify-center rounded-full bg-white/90 shadow-[0_2px_8px_rgba(10,30,60,0.18)] active:bg-white">
          <Bell size={18} strokeWidth={1.8} absoluteStrokeWidth color={HEAD} />
          {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 4, top: 4, width: 11, height: 11 }} />}
        </button>
      }
      hero={
        <>
          <div className="flex gap-[6px]">
            {stat("履歴", historyCount, <ClockBack size={18} stroke={1.8} color={NAVY} />, onHistory)}
            {stat("お気に入り", favoriteCount, <Star size={17} strokeWidth={1.8} absoluteStrokeWidth color="#f5a524" fill="#f5a524" />, onFavorites)}
          </div>
          <div className="mt-[6px] flex items-center gap-[8px] rounded-[14px] px-[12px] text-white" style={{ height: 44, background: "linear-gradient(135deg,#1b4280 0%,#133664 55%,#0a2248 100%)" }}>
            <LogIn size={17} strokeWidth={1.8} absoluteStrokeWidth className="shrink-0" />
            <span className="min-w-0 flex-1 truncate font-semibold leading-none" style={{ fontSize: 14 }}>
              ログイン・会社での共有
            </span>
            <span className="shrink-0 rounded-full bg-white/20 px-[8px] py-[4px] font-bold leading-none" style={{ fontSize: 11 }}>
              準備中
            </span>
          </div>
        </>
      }
      banner={banner}
    >
      <section>
        <Head title="使い方・データ・アプリ" className="mt-[10px]" />
        <div className={`overflow-hidden ${CARD}`}>
          <Row icon={icon(CircleHelp)} title="使い方" sub="住所・地番・地図で調べて、市の地図を開くまで" minH={52} onClick={onHelp} />
          <Row icon={icon(MapPin)} title="対応している市区町村" right={`${MUNICIPALITIES.length}`} rightColor={LIGHT} sub="関東1都6県" minH={52} onClick={onCities} />
          <Row icon={icon(Database)} title="データの出典と時点" sub="国・自治体の公開データ" minH={52} onClick={onSources} />
          <Row
            icon={
              <span className="relative flex">
                <Bell size={17} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />
                {unread && <span className="absolute -right-[3px] -top-[2px] size-[8px] rounded-full border border-white bg-[#f0263a]" />}
              </span>
            }
            title="お知らせ"
            sub={NEWS[0].title}
            right={unread ? "新着" : NEWS[0].date}
            rightColor={unread ? "#c0391b" : LIGHT}
            minH={52}
            onClick={onNews}
          />
          <Row icon={icon(Smartphone)} title="ホーム画面に追加" sub={standalone ? "追加したアプリで開いています" : "ブラウザの枠なしで、アプリのように使う"} right={standalone ? "追加済み" : undefined} rightColor={LIGHT} minH={52} onClick={onInstall} />
        </div>
      </section>
      <Note className="mt-[12px] px-[4px]">
        MICHILU は不動産会社の営業のための調査アプリ（最終更新 {NEWS[0].date}）。住所はサーバーに送らないので、共有は「結果の文面」で。地図・データは参考情報で、MICHILUは判定をしません。
      </Note>
    </TabScreen>
  );
}
