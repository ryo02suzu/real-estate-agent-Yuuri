import { beforeEach, describe, expect, it } from "vitest";
import { lastExported, noteExported } from "../backup";
import { EMPTY_SETTINGS } from "../inquiry-store";
import type { PropertyRecords } from "../records";
import { EMPTY_SENDER, senderShort } from "../sender";
import { backupNote, recordedCount, senderNote, templateNote } from "./menu";

// 端末の localStorage の代わり（テストの間だけ）
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

describe("右上のメニューの一言", () => {
  it("差出人：未設定なら入れると何に入るか、入っていれば会社名・担当者と電話を1行ずつ", () => {
    expect(senderNote(EMPTY_SENDER)).toEqual({ lines: [["会社名・担当者を入れると、照会文・調査メモ・案内図に入ります"]], set: false });
    // 書類の右上に入れる形（senderShort）と同じ並び。行の中は折り返してよい区切りごと
    const full = { company: "株式会社ミチル不動産", person: "山田", phone: "03-0000-0000", email: "info@example.co.jp" };
    expect(senderNote(full)).toEqual({ lines: [["株式会社ミチル不動産", "担当 山田"], ["TEL 03-0000-0000", "info@example.co.jp"]], set: true });
    expect(senderNote(full).lines.map((l) => l.join(" "))).toEqual(senderShort(full));
    // 担当者だけでも「入っている」
    expect(senderNote({ ...EMPTY_SENDER, person: "山田" })).toEqual({ lines: [["担当 山田"]], set: true });
  });

  it("照会の文面：標準のまま・自分のひな形を使っている・FAX の宛先の形あり", () => {
    expect(templateNote(EMPTY_SETTINGS)).toBe("標準のひな形で作ります。自分のひな形も作れます");
    const mine = { id: "t1", name: "道路の照会", subject: "s", body: "b" };
    expect(templateNote({ list: [mine], fax: "", pick: "t1" })).toBe("自分のひな形 1件・使うのは「道路の照会」");
    // 自分のひな形があっても、選んでいるのが標準なら「標準」。名前の無いひな形は「名前なし」
    expect(templateNote({ list: [mine], fax: "", pick: "standard" })).toBe("自分のひな形 1件・使うのは「標準」");
    expect(templateNote({ list: [{ ...mine, name: " " }], fax: "{番号}@fax.example.jp", pick: "t1" })).toBe("自分のひな形 1件・使うのは「名前なし」・FAX をメールで送る宛先の形あり");
  });

  it("書き出し：最後に書き出した日時。まだで記録があるときだけ勧める", () => {
    const now = new Date(2026, 10, 13, 15, 0).getTime();
    expect(backupNote(null, now, 0)).toEqual({ text: "機種変更・データの消失への備え", warn: false });
    expect(backupNote(null, now, 3)).toEqual({ text: "まだ書き出していません。機種変更・データの消失に備えて", warn: true });
    expect(backupNote(new Date(2026, 10, 13, 9, 5).getTime(), now, 3)).toEqual({ text: "最後の書き出し 今日 09:05", warn: false });
    expect(backupNote(new Date(2026, 10, 4, 18, 0).getTime(), now, 3)).toEqual({ text: "最後の書き出し 11/4（水）", warn: false });
  });

  it("書き出した日時を覚えて読み出す（壊れた値・無い値は「まだ」）", () => {
    expect(lastExported()).toBeNull();
    noteExported(1_700_000_000_000);
    expect(lastExported()).toBe(1_700_000_000_000);
    store.set("michilu:exported-at", "壊れた値");
    expect(lastExported()).toBeNull();
  });

  it("確認の記録がある物件の数（記録を消して空になった物件は数えない）", () => {
    const rec = (key: string, items: PropertyRecords["items"]): PropertyRecords => ({ key, label: key, items, updatedAt: 1 });
    expect(recordedCount([])).toBe(0);
    expect(recordedCount([rec("a", { road: { kind: { done: true, at: 1 } } }), rec("b", {}), rec("c", { road: {} }), rec("d", { hazard: { flood: { done: false, note: "メモ", at: 1 } } })])).toBe(2);
  });
});
