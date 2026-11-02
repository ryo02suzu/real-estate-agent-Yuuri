import { describe, expect, it } from "vitest";
import type { LookupResult } from "./roadmap";
import { accuracyOf, nextCamera, pointView, positionAccuracy, type AccuracyKind } from "./position-accuracy";

/** 結果の形だけを作る（地図のカメラが見る項目だけ） */
const ok = (lat: number, lng: number, extra: Partial<Extract<LookupResult, { status: "ok" }>> = {}) =>
  ({ status: "ok", lat, lng, approximate: false, matchedAddress: "東京都千代田区丸の内一丁目", ...extra }) as Extract<LookupResult, { status: "ok" }>;

describe("新しい結果と地図のカメラ（スマホの日本地図）", () => {
  const home = { cam: null, key: 0 };

  it("確定した結果では、その地点へ寄せ直す合図（key）が増える。同じ地点の調べ直しでも増える", () => {
    const a = nextCamera(home, ok(35.68, 139.76));
    expect(a.cam).toMatchObject({ lat: 35.68, lng: 139.76, view: { zoom: 16, pin: "solid" } });
    expect(a.key).toBe(1);
    const again = nextCamera(a, ok(35.68, 139.76));
    expect(again.key).toBe(2);
  });

  it("候補待ち・見つからないでは、カメラもピンも前のまま（key も増えない。地図を見ていても引き戻さない）", () => {
    const a = nextCamera(home, ok(35.68, 139.76));
    expect(nextCamera(a, { status: "choose", candidates: [] })).toBe(a);
    expect(nextCamera(a, { status: "not_found" })).toBe(a);
  });

  it("ホーム（結果なし）は日本全体（cam が無い）。key はそのまま", () => {
    const a = nextCamera(home, ok(35.68, 139.76));
    expect(nextCamera(a, null)).toEqual({ cam: null, key: 1 });
  });

  it("町の中心は引いて、中抜きのピンで寄せる（パネルの「位置の目安」と同じ判定）", () => {
    const c = nextCamera(home, ok(36.1, 139.4, { approximate: true }));
    expect(c.cam?.view).toMatchObject({ zoom: 14, pin: "hollow", tag: "町の中心" });
  });
});

type Input = Parameters<typeof positionAccuracy>[0];
const parcel = (estimated?: "high" | "low") => ({ estimated }) as unknown as NonNullable<Input["parcel"]>;

describe("位置の目安", () => {
  it("住所の一致は「付近」（断定しない）", () => {
    expect(positionAccuracy({ approximate: false })).toEqual({ kind: "address", label: "付近", warn: false });
  });

  it("番地が見つからず町の中心を出しているときは注意", () => {
    expect(positionAccuracy({ approximate: true })).toEqual({ kind: "town", label: "町の中心", warn: true });
  });

  it("地図で選んだ地点", () => {
    expect(positionAccuracy({ approximate: false, picked: true })).toEqual({ kind: "picked", label: "地図で選んだ地点", warn: false });
    // 選んだ地点の筆があっても、選んだ地点として扱う（筆は参考）
    expect(positionAccuracy({ approximate: false, picked: true, parcel: parcel() })).toEqual({ kind: "picked", label: "地図で選んだ地点", warn: false });
  });

  it("地番で探した筆は、公図から推定したものだけ「推定」で注意", () => {
    expect(positionAccuracy({ approximate: false, parcel: parcel() })).toEqual({ kind: "parcel", label: "地番で探した筆", warn: false });
    expect(positionAccuracy({ approximate: false, parcel: parcel("high") })).toEqual({ kind: "estimated", label: "推定", warn: true });
    expect(positionAccuracy({ approximate: false, parcel: parcel("low") })).toEqual({ kind: "estimated-low", label: "推定（確度低）", warn: true });
  });

  it("町の中心は、ほかの条件より優先する", () => {
    expect(positionAccuracy({ approximate: true, parcel: parcel("low") }).label).toBe("町の中心");
  });

  it("未対応の市町村は住所の付近。候補待ち・見つからないときは目安が無い（地図のカメラを動かさない）", () => {
    const unsupported: LookupResult = { status: "unsupported", lat: 34.7, lng: 135.5, muniCd: "27100", matchedAddress: "大阪府大阪市北区" };
    expect(accuracyOf(unsupported)?.kind).toBe("address");
    expect(accuracyOf({ status: "not_found" })).toBeNull();
    expect(accuracyOf({ status: "choose", candidates: [] })).toBeNull();
  });
});

describe("地図のカメラとピン（位置の目安に合わせる）", () => {
  const kinds: AccuracyKind[] = ["address", "town", "picked", "parcel", "estimated", "estimated-low"];

  it("町の中心は、町の広がりが見えるよう住所の一致より引いて見せる。筆は少し寄る", () => {
    expect(pointView("town").zoom).toBeLessThan(pointView("address").zoom);
    expect(pointView("parcel").zoom).toBeGreaterThanOrEqual(pointView("address").zoom);
    // 推定の筆は、確かな筆より寄りすぎない
    expect(pointView("estimated").zoom).toBeLessThanOrEqual(pointView("parcel").zoom);
    expect(pointView("estimated-low").zoom).toBeLessThanOrEqual(pointView("parcel").zoom);
  });

  it("注意して見てほしい目安（町の中心・推定）だけ、中抜きのピンと札。札は画面の目安の文字と合わせる", () => {
    for (const k of kinds) {
      const a = positionAccuracy(k === "town" ? { approximate: true } : k === "picked" ? { approximate: false, picked: true } : k === "parcel" ? { approximate: false, parcel: parcel() } : k === "estimated" ? { approximate: false, parcel: parcel("high") } : k === "estimated-low" ? { approximate: false, parcel: parcel("low") } : { approximate: false });
      expect(a.kind).toBe(k);
      const v = pointView(k);
      expect(v.pin === "hollow").toBe(a.warn);
      expect(!!v.tag).toBe(a.warn);
    }
    expect(pointView("town").tag).toBe("町の中心");
    expect(pointView("estimated").tag).toBe("推定");
  });

  it("ピンの説明は、確かな位置と言い切らない（付近・推定・町の中心を書く）。誤差の大きさは既存の注記の言葉だけ", () => {
    expect(pointView("address").title).toContain("付近");
    expect(pointView("town").title).toContain("町の中心");
    expect(pointView("estimated").title).toContain("数mずれることあり");
    expect(pointView("estimated-low").title).toContain("5m前後ずれることあり");
    // ズームは地図が読めるタイルの範囲（地理院タイルは z18 まで。256px のタイルは「ズーム＋1」の段を読む）
    for (const k of kinds) expect(pointView(k).zoom).toBeLessThanOrEqual(17);
  });
});
