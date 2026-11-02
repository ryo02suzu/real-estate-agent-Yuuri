import { describe, expect, it } from "vitest";
import type { HistoryItem } from "../history";
import { copyLabel, copyText, dayGroup, fullDate, groupByProperty, inRange, kindOf, markOf, matches, rangeCounts, recordsText, removedText, sections, stamp, when } from "./history-view";

// 端末の時刻で数える（2026年11月1日（日）15:00 を「いま」にする）
const at = (m: number, d: number, h = 12, mi = 0, y = 2026) => new Date(y, m - 1, d, h, mi).getTime();
const NOW = at(11, 1, 15);

const A: HistoryItem = { address: "地番 松戸市古ヶ崎四丁目3556-1", city: "松戸市", at: at(11, 1, 14, 32), pid: "p1" };
const B: HistoryItem = { address: "渋谷区神南1-19-11", city: "渋谷区", at: at(11, 1, 9, 5) };
const C: HistoryItem = { address: "松戸市古ヶ崎四丁目3556番地の1", city: "松戸市", at: at(10, 31, 20, 0), pid: "p1" };
const D: HistoryItem = { address: "東京都千代田区丸の内一丁目", city: "千代田区", at: at(10, 28, 8, 0), ll: [35.681236, 139.767132] };
const E: HistoryItem = { address: "神南1-19-11", city: "渋谷区", at: at(10, 10, 10, 0) };
const F: HistoryItem = { address: "大阪府大阪市北区梅田1-1", at: at(3, 3, 10, 0, 2025) };

describe("履歴のページの並べ方・絞り込み", () => {
  it("種類を見分ける（地図で選んだ場所・地番・住所）", () => {
    expect([A, B, D].map(kindOf)).toEqual(["chiban", "address", "map"]);
  });

  it("絞り込みは全角・半角を同じに扱い、合う所に印を付けられる", () => {
    expect(matches(A, "古ヶ崎")).toBe(true);
    expect(matches(A, "３５５６")).toBe(true);
    expect(matches(B, "古ヶ崎")).toBe(false);
    expect(matches(B, "  ")).toBe(true);
    expect(markOf("松戸市古ヶ崎四丁目", "古ヶ崎")).toEqual(["松戸市", "古ヶ崎", "四丁目"]);
    expect(markOf("地番：3556-1", "３５５６")).toEqual(["地番：", "3556", "-1"]);
    // 元の字（全角）のまま返す
    expect(markOf("神南１－１９", "1-19")).toEqual(["神南", "１－１９", ""]);
    expect(markOf("松戸市", "渋谷")).toBeNull();
    expect(markOf("松戸市", "")).toBeNull();
  });

  it("日付の章は暦の日で数える", () => {
    expect([A, C, D, E, F].map((h) => dayGroup(h.at, NOW))).toEqual(["今日", "昨日", "1週間以内", "1か月以内", "それより前"]);
    // 日付をまたいだ直後でも、昨日の夜は「昨日」
    expect(dayGroup(at(10, 31, 23, 59), at(11, 1, 0, 1))).toBe("昨日");
  });

  it("行の日時：章の中では時刻か月日と曜日、市区町村ごとでは日も付ける", () => {
    expect(stamp(A.at, NOW, false)).toBe("14:32");
    expect(stamp(A.at, NOW, true)).toBe("今日 14:32");
    expect(stamp(C.at, NOW, true)).toBe("昨日 20:00");
    expect(stamp(D.at, NOW, false)).toBe("10/28（水）");
    expect(stamp(F.at, NOW, true)).toBe("2025/3/3");
    expect(fullDate(A.at)).toBe("2026年11月1日（日）14:32");
    expect(when(B.at, NOW)).toBe("09:05");
    expect(when(D.at, NOW)).toBe("10/28");
    expect(when(F.at, NOW)).toBe("2025/3/3");
  });

  it("同じ物件はひとつの行にまとめ、いちばん新しい検索を行にする", () => {
    const g = groupByProperty([A, B, C, D]);
    expect(g.map((x) => x.item.address)).toEqual([A.address, B.address, D.address]);
    expect(g[0].kinds).toEqual(["chiban", "address"]);
    expect(g[0].members).toEqual([A, C]);
  });

  it("章は日付ごと（新しい順）か市区町村ごと（最近調べた市区町村から）", () => {
    const rows = groupByProperty([A, B, D, E, F]);
    expect(sections(rows, false, NOW).map((s) => [s.label, s.rows.length])).toEqual([
      ["今日", 2],
      ["1週間以内", 1],
      ["1か月以内", 1],
      ["それより前", 1],
    ]);
    expect(sections(rows, true, NOW).map((s) => [s.label, s.rows.map((r) => r.item.at)])).toEqual([
      ["松戸市", [A.at]],
      ["渋谷区", [B.at, E.at]],
      ["千代田区", [D.at]],
      ["対応エリアの外", [F.at]],
    ]);
  });

  it("まとめて消す範囲：過去1時間・今日・今日と昨日・すべて", () => {
    const list = [A, B, C, D, E, F];
    expect(rangeCounts(list, NOW)).toEqual({ hour: 1, today: 2, twoDays: 3, all: 6 });
    expect(inRange(C, "today", NOW)).toBe(false);
    expect(inRange(C, "twoDays", NOW)).toBe(true);
    // 過去1時間は日付をまたいでも60分
    expect(inRange({ address: "x", at: at(10, 31, 23, 40) }, "hour", at(11, 1, 0, 20))).toBe(true);
  });

  it("コピーする文：地番の「地番」は外し、市区町村が無ければ付け、地図で選んだ場所は緯度・経度も", () => {
    expect([copyLabel(A), copyText(A)]).toEqual(["地番", "松戸市古ヶ崎四丁目3556-1"]);
    expect([copyLabel(E), copyText(E)]).toEqual(["住所", "渋谷区神南1-19-11"]);
    expect([copyLabel(D), copyText(D)]).toEqual(["場所", "東京都千代田区丸の内一丁目（35.68124, 139.76713）"]);
  });

  it("確認の記録の札：項目の名前（多いときは数）", () => {
    expect(recordsText({ all: ["道路"], partial: ["ハザード"] })).toBe("確認済み：道路・一部：ハザード");
    expect(recordsText({ all: [], partial: ["ハザード", "周辺環境"] })).toBe("一部確認：ハザード・周辺環境");
    expect(recordsText({ all: ["道路", "都市計画", "ハザード"], partial: [] })).toBe("確認済み：3項目");
    expect(recordsText({ all: [], partial: [] })).toBe("");
  });

  it("消したあとの文", () => {
    expect(removedText([A])).toBe("「古ヶ崎四丁目」を消しました");
    expect(removedText([A, B, C])).toBe("3件を消しました");
  });
});
