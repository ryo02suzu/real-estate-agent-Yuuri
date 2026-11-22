import { describe, expect, it } from "vitest";
import { SP_OPENING_READY } from "@/lib/app/opening-sp";
import { LAUNCH_QUICK_WITHIN_MS, LAUNCH_SCRIPT, launchScript } from "./launch-script";

/** <head> で動く起動の演出の決め方（本物の文字列をそのまま動かす）。端末の幅・動きを減らす設定・URL・端末に覚えた値を差し替える */
function run({ wide = false, reduced = false, hash = "", search = "", store = {} as Record<string, string>, now = 1_800_000_000_000, broken = false, film = false, saveData = false } = {}) {
  const attrs: Record<string, string> = {};
  const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
  const location = { hash, search };
  const matchMedia = (q: string) => ({ matches: q.includes("min-width") ? wide : q.includes("reduce") ? reduced : false });
  const localStorage = broken
    ? {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      }
    : { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) };
  const date = { now: () => now };
  const navigator = { connection: { saveData } };
  new Function("document", "location", "matchMedia", "localStorage", "Date", "navigator", launchScript(film))(
    document,
    location,
    matchMedia,
    localStorage,
    date,
    navigator,
  );
  return { mode: attrs["data-launch"] ?? null, store };
}

describe("アプリを開いたときの演出の決め方（html の data-launch）", () => {
  it("はじめて開いたときは長い版。開いた時刻を端末に覚える", () => {
    const r = run();
    expect(r.mode).toBe("full");
    expect(r.store["michilu:launch"]).toBe("1800000000000");
  });

  it("前に開いてから10分以内は短い版、それより前なら長い版", () => {
    const now = 1_800_000_000_000;
    expect(run({ now, store: { "michilu:launch": String(now - 60_000) } }).mode).toBe("quick");
    expect(run({ now, store: { "michilu:launch": String(now - LAUNCH_QUICK_WITHIN_MS - 1000) } }).mode).toBe("full");
  });

  it("≡ の「動きの演出」がオフなら短い版", () => {
    expect(run({ store: { "michilu:motion": "off" } }).mode).toBe("quick");
  });

  it("PC の幅・動きを減らす設定・住所や地点のリンクで開いたときは出さない", () => {
    expect(run({ wide: true }).mode).toBeNull();
    expect(run({ reduced: true }).mode).toBeNull();
    expect(run({ hash: "#q=%E6%B8%8B%E8%B0%B7" }).mode).toBeNull();
    expect(run({ hash: "#ll=35.6,139.7" }).mode).toBeNull();
    expect(run({ hash: "#t=2026-11-02T13:40&q=x" }).mode).toBeNull();
    expect(run({ search: "?q=x" }).mode).toBeNull();
  });

  it("#launch= で選べる（確かめる用）。ほかの # の値は関係ない", () => {
    expect(run({ hash: "#launch=quick" }).mode).toBe("quick");
    const now = 1_800_000_000_000;
    expect(run({ now, hash: "#t=2026-11-02T13:40&launch=full", store: { "michilu:launch": String(now - 1000) } }).mode).toBe("full");
    expect(run({ hash: "#t=2026-11-02T13:40" }).mode).toBe("full");
  });

  it("端末に保存できない（プライベートブラウズなど）ときも、止まらずに長い版", () => {
    expect(run({ broken: true }).mode).toBe("full");
  });

  it("映像が入っていないあいだは、スマホのオープニング（film）にしない", () => {
    expect(run().mode).toBe("full");
    expect(run().store["michilu:film-day"]).toBeUndefined();
  });

  it("<head> に入れる文字列は、映像が入っているか（SP_OPENING_READY）に合わせて作ったもの", () => {
    expect(LAUNCH_SCRIPT).toBe(launchScript(SP_OPENING_READY));
  });
});

describe("スマホのオープニング「富士の目覚め」（film）を流す日", () => {
  const day = 86_400_000;
  const now = 1_800_000_000_000;
  it("その日に最初に開いたときだけ流し、流した日を端末に覚える", () => {
    const first = run({ film: true, now });
    expect(first.mode).toBe("film");
    expect(first.store["michilu:film-day"]).toBe(String(Math.floor(now / day)));
    // 同じ日にもう一度（10 分より後）：いつもの長い版
    const again = run({ film: true, now: now + 3_600_000, store: { ...first.store } });
    expect(again.mode).toBe("full");
    // 次の日：また流す
    expect(run({ film: true, now: now + day, store: { ...first.store, "michilu:launch": String(now) } }).mode).toBe("film");
  });

  it("続けて開いた（10 分以内）・動きの演出がオフ・通信量を減らす設定・端末に覚えられないときは流さない", () => {
    expect(run({ film: true, now, store: { "michilu:launch": String(now - 60_000) } }).mode).toBe("quick");
    expect(run({ film: true, store: { "michilu:motion": "off" } }).mode).toBe("quick");
    expect(run({ film: true, saveData: true }).mode).toBe("full");
    expect(run({ film: true, broken: true }).mode).toBe("full");
  });

  it("PC の幅・動きを減らす設定・住所のリンクでは出さない。#launch=film で選べる（確かめる用）", () => {
    expect(run({ film: true, wide: true }).mode).toBeNull();
    expect(run({ film: true, reduced: true }).mode).toBeNull();
    expect(run({ film: true, hash: "#q=x" }).mode).toBeNull();
    expect(run({ hash: "#launch=film" }).mode).toBe("film");
  });
});
