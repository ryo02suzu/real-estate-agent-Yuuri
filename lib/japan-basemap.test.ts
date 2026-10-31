import { describe, expect, it } from "vitest";
import {
  boundsPx,
  cameraMove,
  distanceM,
  fitZoom,
  GSI_PALE_URL,
  GSI_STD_URL,
  JAPAN_BOUNDS,
  JAPAN_MAIN_BOUNDS,
  MAIN_ONLY_MIN_ZOOM,
  MAP_MIN_ZOOM,
  MAP_SIDE,
  MAP_TOP,
  noticeFor,
  overviewPadding,
  planBase,
  POINT_MIN_VISIBLE,
  pointPadding,
  probeLowZoom,
  probeTile,
  PROBE_ZOOM,
  SIDE_MAP_TOP,
  tileUrl,
  tileZoomAt,
  type TileProbe,
} from "./japan-basemap";
import { sidePanelWidth } from "./mobile-layout";

describe("カメラの動かし方", () => {
  it("2点間の距離：同じ点は0、東京駅〜新宿駅は約6km", () => {
    expect(distanceM({ lat: 35.681, lng: 139.767 }, { lat: 35.681, lng: 139.767 })).toBe(0);
    const d = distanceM({ lat: 35.681, lng: 139.767 }, { lat: 35.69, lng: 139.7 });
    expect(d).toBeGreaterThan(5800);
    expect(d).toBeLessThan(6400);
  });

  it("引いた地図（日本全体など）からは常にそのまま寄る", () => {
    expect(cameraMove(3.4, 400_000)).toBe("ease");
    expect(cameraMove(7.9, 100_000)).toBe("ease");
  });

  it("寄った地図から近い所へはそのまま、遠い所へは引いてから寄る", () => {
    expect(cameraMove(16, 300)).toBe("ease");
    expect(cameraMove(16, 1500)).toBe("ease");
    expect(cameraMove(16, 1501)).toBe("fly");
    expect(cameraMove(12, 50_000)).toBe("fly");
  });
});

describe("日本地図の背景タイル", () => {
  it("確かめるタイルは東京駅付近を含む（z3=7/3、z4=14/6）", () => {
    expect(probeTile(3)).toEqual({ z: 3, x: 7, y: 3 });
    expect(probeTile(4)).toEqual({ z: 4, x: 14, y: 6 });
  });

  it("タイルのURLを組み立てる", () => {
    expect(tileUrl(GSI_PALE_URL, probeTile(4))).toBe("https://cyberjapandata.gsi.go.jp/xyz/pale/4/14/6.png");
    expect(tileUrl(GSI_STD_URL, probeTile(4))).toBe("https://cyberjapandata.gsi.go.jp/xyz/std/4/14/6.png");
  });

  it("最小ズームで読むタイルの段は、確かめる段と同じ（MapLibre の 256px ラスタは round(ズーム+1) の段。確かめていない段は読まない）", () => {
    expect(tileZoomAt(MAP_MIN_ZOOM)).toBe(PROBE_ZOOM);
    // 2.5〜3.49 は z4、3.5 からは z5（四捨五入）
    expect(tileZoomAt(2.5)).toBe(4);
    expect(tileZoomAt(3.49)).toBe(4);
    expect(tileZoomAt(3.5)).toBe(5);
  });

  it("日本の主な島の範囲は、日本全体の範囲の内側にあり、z5 以上だけで見せられる。375px 幅の画面にも入る", () => {
    const [[w, s], [e, n]] = JAPAN_BOUNDS;
    const [[mw, ms], [me, mn]] = JAPAN_MAIN_BOUNDS;
    expect(mw).toBeGreaterThanOrEqual(w);
    expect(ms).toBeGreaterThanOrEqual(s);
    expect(me).toBeLessThanOrEqual(e);
    expect(mn).toBeLessThanOrEqual(n);
    expect(tileZoomAt(MAIN_ONLY_MIN_ZOOM)).toBe(5);
    expect(boundsPx(JAPAN_MAIN_BOUNDS, MAIN_ONLY_MIN_ZOOM).w).toBeLessThanOrEqual(375 - 2 * MAP_SIDE);
  });

  it("背景の決め方：淡色が使えればそのまま、無ければ標準、どちらも無ければ主な島だけ", () => {
    expect(planBase({ pale: "ok" })).toBe("pale");
    expect(planBase({ pale: "missing", std: "ok" })).toBe("std");
    expect(planBase({ pale: "missing", std: "missing" })).toBe("main-only");
    expect(planBase({ pale: "missing", std: "unknown" })).toBe("main-only");
  });

  it("遅くて返事が無い（unknown）だけなら、無いと決めつけず淡色のまま（遅い回線で表示を落とさない）", () => {
    expect(planBase({ pale: "unknown" })).toBe("pale");
  });

  it("日本全体を見せられないときだけ、そのことを画面に書く", () => {
    expect(noticeFor("main-only")).toContain("北海道〜九州");
    expect(noticeFor("pale")).toBeNull();
    expect(noticeFor("std")).toBeNull();
  });

  it("確認は固定の東京付近のタイルだけ（住所や座標は使わない）。淡色が読めたら標準には問い合わせない", async () => {
    const asked: string[] = [];
    const r = await probeLowZoom(async (url) => {
      asked.push(url);
      return "ok";
    });
    expect(asked).toEqual(["https://cyberjapandata.gsi.go.jp/xyz/pale/4/14/6.png"]);
    expect(r).toEqual({ pale: "ok" });
  });

  it("淡色が読めないと分かったときだけ、標準地図を問い合わせる", async () => {
    const asked: string[] = [];
    const r = await probeLowZoom(async (url): Promise<TileProbe> => {
      asked.push(url);
      return url.includes("/std/") ? "ok" : "missing";
    });
    expect(asked).toEqual(["https://cyberjapandata.gsi.go.jp/xyz/pale/4/14/6.png", "https://cyberjapandata.gsi.go.jp/xyz/std/4/14/6.png"]);
    expect(r).toEqual({ pale: "missing", std: "ok" });
    expect(planBase(r)).toBe("std");
  });

  it("確認中の通信エラー（例外）は「読めない」として扱い、止まらない", async () => {
    const r = await probeLowZoom(async () => {
      throw new Error("offline");
    });
    expect(r).toEqual({ pale: "missing", std: "missing" });
    expect(planBase(r)).toBe("main-only");
  });
});

describe("日本全体の見せ方（余白とズーム）", () => {
  /** ホームのパネルの高さ（推定。履歴なし・3件）。レビューでの見積もり：縦 247/324、横向き 247/324 */
  const PANEL = { none: 247, three: 324 };

  it("縦の画面（375×667〜430×932）では、下の余白はパネルの高さ＋8px のまま、日本全体が最小ズーム以上で入る", () => {
    for (const [w, h] of [
      [375, 667],
      [390, 844],
      [402, 874],
      [430, 932],
    ]) {
      for (const p of [PANEL.none, PANEL.three]) {
        const pad = overviewPadding({ w, h }, p);
        expect(pad.bottom).toBe(p + 8);
        expect(pad.top).toBe(MAP_TOP);
        expect(fitZoom({ w, h }, pad)).toBeGreaterThanOrEqual(MAP_MIN_ZOOM);
      }
    }
  });

  it("375×667・履歴3件でも、最小ズームに切り上げられない（以前の最小ズーム3では北海道の北が上の帯に隠れた）", () => {
    const pad = overviewPadding({ w: 375, h: 667 }, PANEL.three);
    const z = fitZoom({ w: 375, h: 667 }, pad);
    expect(z).toBeGreaterThanOrEqual(MAP_MIN_ZOOM);
    expect(z).toBeLessThan(3);
  });

  it("横向き（667×375・844×390）でパネルが高さのほとんどを覆っても、余白を減らして必ず入る（[0,0] のまま・画面の外へ飛ばない）", () => {
    for (const [w, h] of [
      [667, 375],
      [844, 390],
    ]) {
      for (const p of [PANEL.none, PANEL.three]) {
        const pad = overviewPadding({ w, h }, p);
        expect(pad.bottom).toBeGreaterThanOrEqual(0);
        expect(h - pad.top - pad.bottom).toBeGreaterThanOrEqual(boundsPx(JAPAN_BOUNDS, MAP_MIN_ZOOM).h);
        expect(fitZoom({ w, h }, pad)).toBeGreaterThanOrEqual(MAP_MIN_ZOOM - 1e-9);
      }
    }
  });

  it("主な島だけのときも、その範囲が最小ズームで入る余白にする", () => {
    const pad = overviewPadding({ w: 375, h: 667 }, PANEL.three, JAPAN_MAIN_BOUNDS, MAIN_ONLY_MIN_ZOOM);
    expect(fitZoom({ w: 375, h: 667 }, pad, JAPAN_MAIN_BOUNDS)).toBeGreaterThanOrEqual(MAIN_ONLY_MIN_ZOOM - 1e-9);
  });

  it("範囲の大きさ（512px 基準のメルカトル）：日本全体は z3 で約267×306px", () => {
    const s = boundsPx(JAPAN_BOUNDS, 3);
    expect(Math.round(s.w)).toBe(267);
    expect(Math.round(s.h)).toBe(306);
  });
});

describe("横向き（パネルを左の列に寄せる）の地図の余白", () => {
  /** iPhone の横向き（SE・13/14・16 Pro・Pro Max）。left は左のパネルの右端（左の余白 8px＋パネルの幅） */
  const LANDSCAPE = [
    [667, 375],
    [844, 390],
    [874, 402],
    [932, 430],
  ] as const;

  it("日本全体は、左のパネルの右側に、最小ズーム以上で入る（北海道〜沖縄が地図の側に収まる）", () => {
    for (const [w, h] of LANDSCAPE) {
      const left = 8 + sidePanelWidth(w);
      const pad = overviewPadding({ w, h }, 0, JAPAN_BOUNDS, MAP_MIN_ZOOM, left);
      expect(pad.left).toBe(left + MAP_SIDE);
      expect(pad.top).toBe(SIDE_MAP_TOP);
      expect(pad.bottom).toBe(8);
      const z = fitZoom({ w, h }, pad);
      expect(z).toBeGreaterThanOrEqual(MAP_MIN_ZOOM);
      // そのズームで、日本全体の幅・高さが余白の内側に入る
      const s = boundsPx(JAPAN_BOUNDS, z);
      expect(s.w).toBeLessThanOrEqual(w - pad.left - pad.right + 1e-6);
      expect(s.h).toBeLessThanOrEqual(h - pad.top - pad.bottom + 1e-6);
    }
  });

  it("縦向き（left=0）の余白は今までと同じ", () => {
    expect(overviewPadding({ w: 390, h: 844 }, 300)).toEqual(overviewPadding({ w: 390, h: 844 }, 300, JAPAN_BOUNDS, MAP_MIN_ZOOM, 0));
    expect(overviewPadding({ w: 390, h: 844 }, 300)).toEqual({ top: MAP_TOP, bottom: 308, left: MAP_SIDE, right: MAP_SIDE });
  });

  it("パネルの右端が地図の幅を食いすぎても、最小ズームで日本全体が入る幅は残す", () => {
    const pad = overviewPadding({ w: 600, h: 360 }, 0, JAPAN_BOUNDS, MAP_MIN_ZOOM, 500);
    expect(600 - pad.left - pad.right).toBeGreaterThanOrEqual(boundsPx(JAPAN_BOUNDS, MAP_MIN_ZOOM).w);
    expect(fitZoom({ w: 600, h: 360 }, pad)).toBeGreaterThanOrEqual(MAP_MIN_ZOOM - 1e-9);
  });

  it("主な島だけのときも、左のパネルの右側に入る", () => {
    const pad = overviewPadding({ w: 667, h: 375 }, 0, JAPAN_MAIN_BOUNDS, MAIN_ONLY_MIN_ZOOM, 8 + sidePanelWidth(667));
    expect(fitZoom({ w: 667, h: 375 }, pad, JAPAN_MAIN_BOUNDS)).toBeGreaterThanOrEqual(MAIN_ONLY_MIN_ZOOM - 1e-9);
  });
});

describe("地点を見せるときの余白（pointPadding）", () => {
  it("縦向き：上は操作帯、下はパネルの高さ。左右は 0", () => {
    expect(pointPadding({ w: 390, h: 844 }, 456)).toEqual({ top: MAP_TOP, bottom: 456, left: 0, right: 0 });
  });

  it("縦向き：パネルが大きくても、パネルの上に地図を最低限残す", () => {
    const p = pointPadding({ w: 667, h: 375 }, 520);
    expect(375 - p.top - p.bottom).toBe(POINT_MIN_VISIBLE);
  });

  it("横向き：ピンは左のパネルの右側の中央に（上の余白は少しだけ、下は 0）", () => {
    const left = 8 + sidePanelWidth(844);
    expect(pointPadding({ w: 844, h: 390 }, 0, left)).toEqual({ top: SIDE_MAP_TOP, bottom: 0, left: left + MAP_SIDE, right: 0 });
  });

  it("横向き：パネルが幅を食いすぎても、地図を最低限残す", () => {
    const p = pointPadding({ w: 400, h: 300 }, 0, 390);
    expect(400 - p.left - p.right).toBe(POINT_MIN_VISIBLE);
  });
});
