// 確認の記録：あなたが公式資料・窓口で確かめたことを、物件ごと・確認事項ごとに端末の localStorage にだけ残す（サーバーには送らない）。
// 自動で取得した情報（データ）とは別の置き場所。項目（道路・都市計画・建築の注意点・ハザード・周辺環境・地番・土地）の中の
// 確認事項を1つずつ記録し、項目の状態は「未確認・一部確認済み・確認済み」を自動で決める（一部だけ確かめても全体を確認済みにしない）。
// 物件の鍵は lib/property-id.ts（信頼できる識別情報があるときだけ同じ物件と見なす）

export type RecordTopic = "road" | "zoning" | "law" | "hazard" | "around" | "parcel";

export type SubItem = { id: string; label: string };

/** 項目ごとの確認事項（1つずつ記録する） */
export const RECORD_ITEMS: Record<RecordTopic, { label: string; subs: SubItem[] }> = {
  road: {
    label: "道路",
    subs: [
      { id: "kind", label: "道路種別" },
      { id: "width", label: "幅員" },
      { id: "frontage", label: "接道の長さ" },
      { id: "setback", label: "セットバックの要否" },
    ],
  },
  zoning: {
    label: "都市計画",
    subs: [
      { id: "youto", label: "用途地域" },
      { id: "ratio", label: "建ぺい率・容積率" },
      { id: "koudo", label: "高度地区・防火" },
      { id: "chiku", label: "地区計画・その他の規制" },
    ],
  },
  law: {
    label: "建築の注意点",
    subs: [
      { id: "kuiki", label: "宅造・盛土・土砂などの区域" },
      { id: "iseki", label: "埋蔵文化財" },
      { id: "lifeline", label: "上下水道・ガス" },
    ],
  },
  hazard: {
    label: "ハザード",
    subs: [
      { id: "flood", label: "洪水・内水" },
      { id: "dosha", label: "土砂災害" },
      { id: "tsunami", label: "津波・高潮" },
      { id: "ekijo", label: "液状化" },
    ],
  },
  around: { label: "周辺環境", subs: [{ id: "site", label: "現地で見たこと" }] },
  parcel: {
    label: "地番・土地",
    subs: [
      { id: "touki", label: "登記の地番・面積" },
      { id: "boundary", label: "境界・越境" },
    ],
  },
};
export const RECORD_TOPICS = Object.keys(RECORD_ITEMS) as RecordTopic[];

export const METHODS = ["窓口", "電話", "公式サイト", "現地", "その他"] as const;
export type Method = (typeof METHODS)[number];

/** 確認事項1つの記録 */
export type SubRecord = {
  /** 確認済みか（外すと false のまま残り、メモは消えない） */
  done: boolean;
  method?: Method;
  /** 出典（「渋谷区 指定道路図」など。自動で入れた値を書き換えられる） */
  source?: string;
  /** あなたのメモ（自由記述。MICHILU は判定しない） */
  note?: string;
  /** 最終更新 */
  at: number;
};

/** 物件1つの記録 */
export type PropertyRecords = {
  /** 物件の鍵（lib/property-id.ts） */
  key: string;
  /** 画面に出す名前（住所） */
  label: string;
  items: Partial<Record<RecordTopic, Record<string, SubRecord>>>;
  updatedAt: number;
};

const KEY = "michilu:records";
/** 記録が変わったとき window に出す合図（読み込みで変わった記録を物件の画面が読み直す） */
export const RECORDS_EVENT = "michilu:records";
/** 覚えておく物件の数（古いものから消す） */
const MAX = 100;

type Stored = Record<string, PropertyRecords>;

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Stored) : {};
  } catch {
    return {};
  }
}

/** 保存できたか（プライベートブラウズや容量不足で保存できないことがある） */
function save(all: Stored): boolean {
  const keys = Object.keys(all).sort((a, b) => all[b].updatedAt - all[a].updatedAt);
  const kept: Stored = {};
  for (const k of keys.slice(0, MAX)) kept[k] = all[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
    if (typeof dispatchEvent === "function") dispatchEvent(new Event(RECORDS_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** 物件の記録（無ければ空） */
export function loadRecords(key: string): PropertyRecords {
  return load()[key] ?? { key, label: "", items: {}, updatedAt: 0 };
}

/** すべての記録（書き出し・履歴の札に） */
export function allRecords(): PropertyRecords[] {
  return Object.values(load()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 確認事項1つを書く。保存後の物件の記録と、保存できたかを返す */
export function writeRecord(key: string, label: string, topic: RecordTopic, sub: string, rec: Omit<SubRecord, "at">): { records: PropertyRecords; saved: boolean } {
  const all = load();
  const cur = all[key] ?? { key, label, items: {}, updatedAt: 0 };
  const now = Date.now();
  const items = { ...cur.items, [topic]: { ...(cur.items[topic] ?? {}), [sub]: { ...rec, at: now } } };
  const next: PropertyRecords = { key, label: label || cur.label, items, updatedAt: now };
  all[key] = next;
  return { records: next, saved: save(all) };
}

/** 確認事項1つの記録を消す */
export function removeRecord(key: string, topic: RecordTopic, sub: string): { records: PropertyRecords; saved: boolean } {
  const all = load();
  const cur = all[key];
  if (!cur) return { records: loadRecords(key), saved: true };
  const t = { ...(cur.items[topic] ?? {}) };
  delete t[sub];
  const items = { ...cur.items };
  if (Object.keys(t).length) items[topic] = t;
  else delete items[topic];
  const next = { ...cur, items, updatedAt: Date.now() };
  if (Object.keys(items).length) all[key] = next;
  else delete all[key];
  return { records: next, saved: save(all) };
}

export type TopicProgress = { done: number; total: number; status: "none" | "partial" | "all"; latest?: number };

/** 項目の確認の進み（確認済みの数・全部の数・状態・最終確認） */
export function topicProgress(records: PropertyRecords | undefined, topic: RecordTopic): TopicProgress {
  const subs = RECORD_ITEMS[topic].subs;
  const recs = records?.items[topic] ?? {};
  const done = subs.filter((s) => recs[s.id]?.done).length;
  const latest = Object.values(recs)
    .filter((r) => r.done)
    .reduce<number | undefined>((m, r) => (m === undefined || r.at > m ? r.at : m), undefined);
  return { done, total: subs.length, status: done === 0 ? "none" : done === subs.length ? "all" : "partial", latest };
}

/** 物件の記録の要約（履歴の行の札）：確認済みの項目数・一部の項目数 */
export function recordsSummary(records: PropertyRecords | undefined): { all: number; partial: number; latest?: number } {
  let all = 0;
  let partial = 0;
  let latest: number | undefined;
  for (const t of RECORD_TOPICS) {
    const p = topicProgress(records, t);
    if (p.status === "all") all++;
    else if (p.status === "partial") partial++;
    if (p.latest && (!latest || p.latest > latest)) latest = p.latest;
  }
  return { all, partial, latest };
}

const md = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 共有の文・印刷に添える「あなたの確認の記録」（記録が無ければ空）。MICHILU の判定ではない旨を添える */
export function recordLines(records: PropertyRecords | undefined): string[] {
  if (!records) return [];
  const lines: string[] = [];
  for (const t of RECORD_TOPICS) {
    const recs = records.items[t];
    if (!recs) continue;
    for (const s of RECORD_ITEMS[t].subs) {
      const r = recs[s.id];
      if (!r) continue;
      const detail = [r.method, r.source, r.note].filter(Boolean).join("・");
      lines.push(`・${RECORD_ITEMS[t].label}／${s.label}：${r.done ? `確認済み（${md(r.at)}）` : "未確認"}${detail ? ` ${detail}` : ""}`);
    }
  }
  return lines.length ? ["", "【あなたの確認の記録】（この端末に残した記録。MICHILU の判定ではありません）", ...lines] : [];
}

/** 書き出し・読み込み（lib/backup.ts）用：全部を入れ替えずに足す。同じ物件・同じ確認事項は新しい方を残す */
export function mergeRecords(incoming: PropertyRecords[]): { added: number; saved: boolean } {
  const all = load();
  let added = 0;
  for (const r of incoming) {
    if (!r || typeof r.key !== "string" || !r.items || typeof r.items !== "object") continue;
    const cur = all[r.key];
    if (!cur) {
      all[r.key] = r;
      added++;
      continue;
    }
    const items = { ...cur.items };
    for (const t of Object.keys(r.items) as RecordTopic[]) {
      const mine = { ...(items[t] ?? {}) };
      for (const [sub, rec] of Object.entries(r.items[t] ?? {})) {
        if (!mine[sub] || rec.at > mine[sub].at) {
          mine[sub] = rec;
          added++;
        }
      }
      items[t] = mine;
    }
    all[r.key] = { ...cur, items, updatedAt: Math.max(cur.updatedAt, r.updatedAt ?? 0), label: cur.label || r.label };
  }
  return { added, saved: save(all) };
}
